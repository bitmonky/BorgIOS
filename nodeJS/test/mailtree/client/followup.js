/*
  Follow-up probes on top of suite.js:
   A) is nDeleted under-reported when the deletion request goes through a cell
      that is itself a holder? (compare delete via holder vs via non-holder)
   B) how far apart are the per-cell cronoTree clocks (mbxStored vs mbxDate)?
*/
const { execSync } = require('child_process');
const crypto = require('crypto');
const https = require('https');
const EC = require('elliptic').ec; const ec = new EC('secp256k1');
const bitcoin = require('bitcoinjs-lib');
const mailCrypto = require('/home/ubuntu/repos/borgHUI/borgHUImailCrypto.js');

const CELLS = { m1:'198.51.101.11', m2:'198.51.101.12', m3:'198.51.101.13', m4:'198.51.101.14' };
const DBS   = { m1:'mt-db1', m2:'mt-db2', m3:'mt-db3', m4:'mt-db4' };
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
  const A=new W(), B=new W();
  await post('m1',{req:'registerInBox',nic:'a2',mailPubKey:A.mailPubKey},A);
  await post('m1',{req:'registerInBox',nic:'b2',mailPubKey:B.mailPubKey},B);
  await sleep(1500);
  const key=(await post('m2',{req:'getInBoxKey',toMUID:B.ownMUID},A)).json.mailPubKey.replace(/\\n/g,'\n');

  async function sendOne(tag){
    const env=mailCrypto.sealMail(key,{from:A.ownMUID,to:B.ownMUID,msg:{subject:'probe '+tag,body:'probe body '+tag}});
    const r=await post('m1',{req:'sendMail',mail:{to:env.to,from:env.from,hash:env.hash,nCopys:3,envelope:env}},A);
    await sleep(1500);
    const holders=[];
    for (const k of Object.keys(DBS)){
      const out=q(k,`select mbxDate,mbxStored from mailTree.mailInBox where mbxHash='${env.hash}'`);
      if (out){ const v=out.split('\n')[1].split('\t'); holders.push({cell:k,mbxDate:+v[0],mbxStored:+v[1]}); }
    }
    return {env,r,holders};
  }

  // A) delete through a NON-holder cell
  let s=await sendOne('nonholder');
  console.log('holders:',s.holders.map(h=>h.cell).join(','));
  const nonHolder=Object.keys(CELLS).find(k=>!s.holders.some(h=>h.cell===k));
  const d1=await post(nonHolder,{req:'deleteMail',mail:{hash:s.env.hash}},B);
  await sleep(2000);
  const left1=Object.keys(DBS).map(k=>k+':'+(q(k,`select count(*)n from mailTree.mailInBox where mbxHash='${s.env.hash}'`).split('\n')[1]));
  console.log(`A1) delete requested through NON-holder ${nonHolder}: nDeleted=${d1.json.nDeleted} rowsLeft=${left1.join(' ')}`);

  // A) delete through a HOLDER cell
  s=await sendOne('holder');
  console.log('holders:',s.holders.map(h=>h.cell).join(','));
  const holder=s.holders[0].cell;
  const d2=await post(holder,{req:'deleteMail',mail:{hash:s.env.hash}},B);
  await sleep(2000);
  const left2=Object.keys(DBS).map(k=>k+':'+(q(k,`select count(*)n from mailTree.mailInBox where mbxHash='${s.env.hash}'`).split('\n')[1]));
  console.log(`A2) delete requested through HOLDER ${holder}: nDeleted=${d2.json.nDeleted} rowsLeft=${left2.join(' ')}`);

  // B) clock skew: each cell's own Date via mbxStored on a fresh send
  s=await sendOne('clock');
  const hostNow=Date.now();
  console.log('B) envelope date (host clock):',s.env.date,' host now:',hostNow);
  s.holders.forEach(h=>console.log(`   ${h.cell}: mbxStored=${h.mbxStored} skew_vs_host=${h.mbxStored-hostNow}ms  mbxDate=${h.mbxDate}`));
  await post('m1',{req:'deleteMail',mail:{hash:s.env.hash}},B);
})();
