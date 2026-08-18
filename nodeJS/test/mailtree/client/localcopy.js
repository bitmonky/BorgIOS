/*
  Probe: does a cell that is itself a holder serve its OWN inbox rows?

  Sends one mail (3 holders), then stops the two holder cells that are NOT the
  cell we ask, so the only possible source of an answer is the asking cell's
  own local mailInBox row. Requires the include:'self' loopback reply.

  Usage: node localcopy.js
*/
const { execSync } = require('child_process');
const crypto = require('crypto');
const https = require('https');
const EC = require('elliptic').ec; const ec = new EC('secp256k1');
const bitcoin = require('bitcoinjs-lib');
const mailCrypto = require('/home/ubuntu/repos/borgHUI/borgHUImailCrypto.js');

const CELLS = { m1:'198.51.101.11', m2:'198.51.101.12', m3:'198.51.101.13', m4:'198.51.101.14' };
const DBS   = { m1:'mt-db1', m2:'mt-db2', m3:'mt-db3', m4:'mt-db4' };
const CONT  = { m1:'mt-m1', m2:'mt-m2', m3:'mt-m3', m4:'mt-m4' };
const sha = t=>crypto.createHash('sha256').update(t).digest('hex');
class W {
  constructor(){ const k=ec.genKeyPair(); this.privateKey=k.getPrivate('hex'); this.publicKey=k.getPublic('hex');
    this.sk=ec.keyFromPrivate(this.privateKey);
    this.ownMUID=bitcoin.payments.p2pkh({pubkey:Buffer.from(this.publicKey,'hex')}).address;
    const r=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
    this.mailPubKey=r.publicKey; this.mailPrivKey=r.privateKey; }
  tok(){ const reqId=crypto.randomUUID(), reqTime=Date.now(), t=`${this.ownMUID}-${reqTime}-${reqId}`;
    return {reqId,reqTime,Address:this.ownMUID,sesTok:t,pubKey:this.publicKey,sesSig:this.sk.sign(sha(t),'base64').toDER('hex')}; }
}
function post(cell,msg,w){ const body=JSON.stringify({msg,borgToken:w.tok()});
  return new Promise(res=>{ const r=https.request({host:CELLS[cell],port:13395,path:'/netREQ',method:'POST',rejectUnauthorized:false,
    headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},x=>{let raw='';x.on('data',d=>raw+=d);
    x.on('end',()=>{let j=null;try{j=JSON.parse(raw);}catch{};res({raw,json:j});});});
    r.on('error',e=>res({raw:String(e),json:null})); r.write(body); r.end(); }); }
const q=(k,s)=>execSync(`docker exec ${DBS[k]} mariadb -ushellfarmer -pshellfarmer -B -e ${JSON.stringify(s)}`,{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const ASK = process.env.ASK_CELL || null;   // optionally force which holder we ask
  const A=new W(), B=new W();
  await post('m1',{req:'registerInBox',nic:'a3',mailPubKey:A.mailPubKey},A);
  await post('m1',{req:'registerInBox',nic:'b3',mailPubKey:B.mailPubKey},B);
  await sleep(1500);
  const look=await post(process.env.KEY_CELL||'m1',{req:'getInBoxKey',toMUID:B.ownMUID},A);
  if (!look.json || !look.json.mailPubKey){ console.log('key lookup failed:',look.raw); process.exit(1); }
  const key=look.json.mailPubKey.replace(/\\n/g,'\n');

  const clear={subject:'local copy probe',body:'local copy body '+crypto.randomBytes(4).toString('hex')};
  const env=mailCrypto.sealMail(key,{from:A.ownMUID,to:B.ownMUID,msg:clear});
  const snd=await post('m1',{req:'sendMail',mail:{to:env.to,from:env.from,hash:env.hash,nCopys:3,envelope:env}},A);
  await sleep(1500);
  const holders=Object.keys(DBS).filter(k=>q(k,`select count(*)n from mailTree.mailInBox where mbxHash='${env.hash}'`).split('\n')[1]!=='0');
  console.log('sendMail nStored=',snd.json.nStored,'holders=',holders.join(','));

  const ask = ASK && holders.includes(ASK) ? ASK : holders[0];
  const stop = holders.filter(h=>h!==ask);
  stop.forEach(h=>execSync(`docker stop ${CONT[h]}`));
  console.log(`asking holder ${ask}; stopped other holders ${stop.join(',')}`);
  await sleep(Number(process.env.HEAL_MS||4000));

  // record the tree role of the cell we are about to ask: a cell that is the
  // PeerTree ROOT never receives its own broadcast (bcast() only sends up to the
  // root and down to children), so it cannot answer from its own local copy.
  let role='unknown';
  try{
    const rep=execSync(`docker exec ${CONT[ask]} sh -c 'curl -sk "https://127.0.0.1:13394/netREQ/msg=%7B%22req%22%3A%22x%22%2C%22what%22%3A%22getNode%22%7D"'`,{encoding:'utf8'});
    const j=JSON.parse(rep); role=`status=${j.status} root=${j.r.rootNodeIp} me=${j.ip} isRoot=${j.ip===j.r.rootNodeIp}`;
  }catch(e){ role='probe failed: '+e.message; }
  console.log('asked cell role:',role);

  const list=await post(ask,{req:'listMyMail'},B);
  const mine=((list.json&&list.json.mail)||[]).filter(m=>m.hash===env.hash);
  let opened=null,err=null;
  try{opened=mailCrypto.openMail({privateKey:B.mailPrivKey},mine[0].envelope);}catch(e){err=e.message;}
  const ok = mine.length===1 && opened && opened.body===clear.body;
  console.log(`RESULT nRecs=${list.json&&list.json.nRecs} copiesOfHash=${mine.length} decrypt=${opened?'ok':'FAILED '+err}`);
  console.log(ok ? 'PASS: holder cell served its own local copy' : 'FAIL: local copy not served');

  stop.forEach(h=>execSync(`docker start ${CONT[h]}`));
  console.log('restarted', stop.join(','));
})();
