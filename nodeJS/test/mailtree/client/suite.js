/*
  Host-side client harness for the multi-cell mailTree sealed-mail lab.

  Speaks the same wire protocol as borgHUIptreeAPI.js / borgHUIconduit.js:
  EC secp256k1 wallet, MUID = bitcoin p2pkh address of the pubkey, borgToken
  signed over `${MUID}-${reqTime}-${reqId}`, POST to the cell receptor
  /netREQ. Sealing/opening uses borgHUImailCrypto.js UNMODIFIED.
*/
const https  = require('https');
const crypto = require('crypto');
const fs     = require('fs');
const { execSync } = require('child_process');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const bitcoin = require('bitcoinjs-lib');
const mailCrypto = require('/home/ubuntu/repos/borgHUI/borgHUImailCrypto.js');

const CELLS = { m1:'198.51.101.11', m2:'198.51.101.12', m3:'198.51.101.13', m4:'198.51.101.14' };
const DBS   = { m1:'mt-db1', m2:'mt-db2', m3:'mt-db3', m4:'mt-db4' };
const PORT  = 13395;

const results = [];
function record(name, ok, detail){
  results.push({name, ok, detail});
  console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${name}\n        ${detail}`);
}
function log(...a){ console.log(...a); }

function sha256hex(t){ return crypto.createHash('sha256').update(t).digest('hex'); }

class Wallet {
  constructor(label){
    const key = ec.genKeyPair();
    this.label      = label;
    this.privateKey = key.getPrivate('hex');
    this.publicKey  = key.getPublic('hex');
    this.signingKey = ec.keyFromPrivate(this.privateKey);
    this.ownMUID    = bitcoin.payments.p2pkh({ pubkey: Buffer.from(this.publicKey,'hex') }).address;
    const rsa = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding : { type:'spki', format:'pem' },
      privateKeyEncoding: { type:'pkcs8', format:'pem' }
    });
    this.mailPubKey  = rsa.publicKey;
    this.mailPrivKey = rsa.privateKey;
  }
  signMsg(tok){ return this.signingKey.sign(sha256hex(tok),'base64').toDER('hex'); }
  getBorgToken(){
    const reqId = crypto.randomUUID();
    const reqTime = Date.now();
    const btok = `${this.ownMUID}-${reqTime}-${reqId}`;
    return { reqId, reqTime, Address:this.ownMUID, sesTok:btok, pubKey:this.publicKey, sesSig:this.signMsg(btok) };
  }
}

function post(cellKey, msg, wallet){
  const body = JSON.stringify({ msg, borgToken: wallet.getBorgToken() });
  return new Promise((resolve)=>{
    const req = https.request({
      host: CELLS[cellKey], port: PORT, path:'/netREQ', method:'POST',
      rejectUnauthorized: false,
      headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res=>{
      let raw='';
      res.on('data',d=>raw+=d);
      res.on('end',()=>{ let json=null; try{json=JSON.parse(raw);}catch{} resolve({status:res.statusCode,raw,json}); });
    });
    req.on('error',e=>resolve({status:null,raw:String(e),json:null}));
    req.write(body); req.end();
  });
}

function sql(dbKey, q){
  return execSync(`docker exec ${DBS[dbKey]} mariadb -ushellfarmer -pshellfarmer -B -e ${JSON.stringify(q)}`,
    {encoding:'utf8', stdio:['pipe','pipe','pipe']});
}
function rows(dbKey, q){
  const out = sql(dbKey,q).trim();
  if (!out) return [];
  const lines = out.split('\n');
  const cols = lines.shift().split('\t');
  return lines.map(l=>{ const v=l.split('\t'); const o={}; cols.forEach((c,i)=>o[c]=v[i]); return o; });
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

(async ()=>{
  const A = new Wallet('A-sender');
  const B = new Wallet('B-recipient');
  const C = new Wallet('C-stranger');
  log('MUIDs:', {A:A.ownMUID, B:B.ownMUID, C:C.ownMUID});

  const SUBJECT_MARK = 'SUBJ-' + crypto.randomBytes(8).toString('hex');
  const BODY_MARK    = 'BODY-' + crypto.randomBytes(8).toString('hex');

  /* ---------- 1. registration ---------- */
  const regA = await post('m1', { req:'registerInBox', nic:'alice', mailPubKey:A.mailPubKey }, A);
  const regB = await post('m1', { req:'registerInBox', nic:'bob',   mailPubKey:B.mailPubKey }, B);
  const regC = await post('m2', { req:'registerInBox', nic:'carol', mailPubKey:C.mailPubKey }, C);
  log('registerInBox responses:', regA.status, regA.raw, '|', regB.status, regB.raw, '|', regC.status, regC.raw);
  await sleep(1500);

  const regHits = {A:[], B:[]};
  for (const k of Object.keys(DBS)){
    for (const [who,w] of [['A',A],['B',B]]){
      const r = rows(k, `select msubMUID,msubPubKey,msubMailPubKey from mailTree.mailSubscriber where msubMUID='${w.ownMUID}'`);
      if (r.length){
        const okKey = (r[0].msubMailPubKey||'').replace(/\\n/g,'\n').trim() === w.mailPubKey.trim();
        const okEc  = r[0].msubPubKey === w.publicKey;
        regHits[who].push({cell:k, mailKeyMatch:okKey, ecKeyMatch:okEc});
      }
    }
  }
  log('registration rows:', JSON.stringify(regHits,null,1));
  const regOK = ['A','B'].every(w => regHits[w].length>0 && regHits[w].every(h=>h.mailKeyMatch && h.ecKeyMatch));
  record('1. two MUIDs register; RSA mail key stored in mailSubscriber.msubMailPubKey', regOK,
    `A on ${regHits.A.map(h=>h.cell).join(',')||'none'}; B on ${regHits.B.map(h=>h.cell).join(',')||'none'}; all key comparisons ${regOK}`);

  /* ---------- 2. broadcast key lookup ---------- */
  const look = await post('m3', { req:'getInBoxKey', toMUID:B.ownMUID }, A);
  const lookKey = (look.json && look.json.mailPubKey || '').replace(/\\n/g,'\n').trim();
  const lookOK = !!(look.json && look.json.result === true && lookKey === B.mailPubKey.trim()
                    && look.json.pubKey === B.publicKey);
  record('2. broadcast key lookup returns recipient RSA mail public key', lookOK,
    `cell m3 answered result=${look.json && look.json.result}; mailPubKey match=${lookKey === B.mailPubKey.trim()}; EC pubKey match=${look.json && look.json.pubKey === B.publicKey}`);

  if (!lookOK){ log('cannot seal without the registry key; raw:', look.raw); }

  /* ---------- 3. send: 3 copies on 3 different cells ---------- */
  const clearMsg = { subject: `hello ${SUBJECT_MARK}`, body: `secret body ${BODY_MARK}`, attach: [] };
  const env = mailCrypto.sealMail(lookKey || B.mailPubKey, { from:A.ownMUID, to:B.ownMUID, msg:clearMsg });
  log('sealed envelope hash:', env.hash, 'date:', env.date);
  const send = await post('m1', { req:'sendMail', mail:{ to:env.to, from:env.from, hash:env.hash, nCopys:3, envelope:env } }, A);
  log('sendMail response:', send.status, send.raw);
  await sleep(1500);

  const holders = [];
  const dateInfo = [];
  for (const k of Object.keys(DBS)){
    const r = rows(k, `select mbxToMUID,mbxFromMUID,mbxHash,mbxDate,mbxStored from mailTree.mailInBox where mbxHash='${env.hash}'`);
    if (r.length){ holders.push({cell:k, n:r.length}); dateInfo.push({cell:k, mbxDate:r[0].mbxDate, mbxStored:r[0].mbxStored}); }
  }
  log('holders:', JSON.stringify(holders), 'dates:', JSON.stringify(dateInfo));
  const sendOK = holders.length === 3 && holders.every(h=>h.n===1) && send.json && send.json.nStored === 3 && send.json.hash === env.hash;
  record('3. one send stores 3 copies on 3 different cells under one hash', sendOK,
    `nStored=${send.json && send.json.nStored}, holder cells=${holders.map(h=>h.cell).join(',')} (rows each: ${holders.map(h=>h.n).join(',')}), hash=${send.json && send.json.hash}`);

  const nowMs = Date.now();
  const dateOK = dateInfo.length>0 && dateInfo.every(d=>{
    const dd = Number(d.mbxDate), ds = Number(d.mbxStored);
    return /^\d+$/.test(String(d.mbxDate)) && /^\d+$/.test(String(d.mbxStored))
      && dd === Number(env.date) && Math.abs(ds-nowMs) < 10*60*1000;
  });
  record('3b. mbxDate/mbxStored are BIGINT ms epoch supplied by the cell (not datetime/NULL)', dateOK,
    JSON.stringify(dateInfo));

  /* ---------- 4. opacity ---------- */
  let leaks = [];
  for (const k of Object.keys(DBS)){
    const dump = sql(k, `select * from mailTree.mailInBox`);
    if (dump.includes(SUBJECT_MARK) || dump.includes(BODY_MARK)) leaks.push(`${DBS[k]} mailInBox rows`);
  }
  for (const [k,c] of Object.entries({m1:'mt-m1',m2:'mt-m2',m3:'mt-m3',m4:'mt-m4'})){
    const lg = execSync(`docker logs ${c} 2>&1 | tail -n 20000`,{encoding:'utf8',maxBuffer:1<<28});
    if (lg.includes(SUBJECT_MARK) || lg.includes(BODY_MARK)) leaks.push(`${c} log`);
  }
  record('4. no holder DB row or cell log contains the plaintext subject/body', leaks.length===0,
    leaks.length ? `LEAKED IN: ${leaks.join('; ')}` : `markers ${SUBJECT_MARK}/${BODY_MARK} absent from all 4 DBs and all 4 cell logs`);

  /* ---------- 5. retrieval + decrypt ---------- */
  const list = await post('m4', { req:'listMyMail' }, B);
  log('listMyMail response nRecs:', list.json && list.json.nRecs, 'raw len', list.raw.length);
  const mine = (list.json && list.json.mail) || [];
  const matching = mine.filter(m=>m.hash === env.hash);
  let opened = null, openErr = null;
  try { opened = mailCrypto.openMail({privateKey:B.mailPrivKey}, matching[0].envelope); }
  catch(e){ openErr = e.message; }
  const decOK = opened && opened.subject === clearMsg.subject && opened.body === clearMsg.body;
  record('5. retrieval returns the message exactly once and recipient decrypts it', matching.length===1 && decOK,
    `nRecs=${list.json && list.json.nRecs}, copies of hash returned=${matching.length}, decrypt=${decOK ? 'ok (subject+body match)' : 'FAILED '+openErr}`);

  const hostsReported = matching.length===1 && matching[0].sig ? 'sender sig present' : 'n/a';
  record('5b. response identifies holder cells (hosts)', !!(list.json && (list.json.hosts || send.json.hosts)),
    `sendMail hosts=${JSON.stringify(send.json && send.json.hosts)}; listMyMail hosts field=${JSON.stringify(list.json && list.json.hosts)} (${hostsReported})`);

  /* ---------- 6. failover: stop one holder ---------- */
  const victim = holders[0].cell;
  const victimC = {m1:'mt-m1',m2:'mt-m2',m3:'mt-m3',m4:'mt-m4'}[victim];
  const asker = Object.keys(CELLS).find(k=>k!==victim);
  execSync(`docker stop ${victimC}`);
  log(`stopped holder ${victim} (${victimC}); asking via ${asker}`);
  await sleep(3000);
  const list2 = await post(asker, { req:'listMyMail' }, B);
  const m2list = ((list2.json && list2.json.mail) || []).filter(m=>m.hash===env.hash);
  let opened2=null; try { opened2 = mailCrypto.openMail({privateKey:B.mailPrivKey}, m2list[0].envelope); } catch(e){}
  record('6. retrieval still works with one holder cell stopped', m2list.length===1 && !!opened2 && opened2.body===clearMsg.body,
    `holder ${victim} stopped; asked ${asker}; copies returned=${m2list.length}; decrypt=${opened2 ? 'ok' : 'failed'}`);

  execSync(`docker start ${victimC}`);
  log('restarted', victimC, '- waiting for it to rejoin');
  await sleep(45000);

  /* ---------- 7. resend / dedupe ---------- */
  const before = {};
  for (const k of Object.keys(DBS)) before[k] = rows(k, `select mbxHash,mbxStored from mailTree.mailInBox where mbxHash='${env.hash}'`);
  const resend = await post('m1', { req:'sendMail', mail:{ to:env.to, from:env.from, hash:env.hash, nCopys:3, envelope:env } }, A);
  log('resend response:', resend.raw);
  await sleep(1500);
  const after = {};
  for (const k of Object.keys(DBS)) after[k] = rows(k, `select mbxHash,mbxStored from mailTree.mailInBox where mbxHash='${env.hash}'`);
  const dupRows = Object.entries(after).filter(([k,r])=>r.length>1);
  const storedUnchanged = Object.keys(before).every(k => !before[k].length || (after[k].length && after[k][0].mbxStored === before[k][0].mbxStored));
  log('rows per cell before:', Object.entries(before).map(([k,r])=>k+':'+r.length).join(' '),
      '| after:', Object.entries(after).map(([k,r])=>k+':'+r.length).join(' '));
  record('7. resending the same envelope creates no duplicate row', dupRows.length===0 && storedUnchanged,
    `max rows per (toMUID,hash) after resend = ${Math.max(...Object.values(after).map(r=>r.length))}; mbxStored preserved on existing copies = ${storedUnchanged}`);

  /* ---------- 8. third MUID cannot read B's mail ---------- */
  const cList = await post('m2', { req:'listMyMail' }, C);
  const cGet  = await post('m2', { req:'getMyMail', mail:{hash:env.hash} }, C);
  const cMail = ((cList.json && cList.json.mail)||[]).concat((cGet.json && cGet.json.mail)||[]);
  record('8. a third MUID cannot retrieve the recipient\u2019s mail', cMail.length===0,
    `C listMyMail nRecs=${cList.json && cList.json.nRecs}; C getMyMail(hash) -> ${cGet.raw.slice(0,160)}`);

  /* ---------- 9. delete removes every copy ---------- */
  const del = await post('m3', { req:'deleteMail', mail:{hash:env.hash} }, B);
  log('deleteMail response:', del.raw);
  await sleep(2000);
  const left = {};
  for (const k of Object.keys(DBS)) left[k] = rows(k, `select mbxHash from mailTree.mailInBox where mbxHash='${env.hash}'`).length;
  const total = Object.values(left).reduce((a,b)=>a+b,0);
  record('9. delete removes all copies from all holders', total===0,
    `nDeleted reported=${del.json && del.json.nDeleted}; rows left per cell=${JSON.stringify(left)}`);

  log('\n================ SUMMARY ================');
  results.forEach(r=>log(`${r.ok?'PASS':'FAIL'}  ${r.name}`));
  log(`${results.filter(r=>r.ok).length}/${results.length} passed`);
  fs.writeFileSync('/home/ubuntu/mailtree-src/nodeJS/test/mailtree/artifacts/results.json', JSON.stringify({results, muids:{A:A.ownMUID,B:B.ownMUID,C:C.ownMUID}, hash:env.hash},null,1));
})();
