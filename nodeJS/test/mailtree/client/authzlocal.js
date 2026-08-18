/*
  Adversarial check on the new LOCAL read/delete path (onLocal callback):
  a third MUID C asks every cell - including the cells that physically hold
  B's mail - for B's mail, both as itself and with a spoofed MUID in the
  payload. Nothing must come back and nothing must be deleted.
*/
const { execSync } = require('child_process');
const crypto = require('crypto');
const https = require('https');
const EC = require('elliptic').ec; const ec = new EC('secp256k1');
const bitcoin = require('bitcoinjs-lib');
const mailCrypto = require('/home/ubuntu/repos/borgHUI/borgHUImailCrypto.js');
const CELLS = { m1:'198.51.101.11', m2:'198.51.101.12', m3:'198.51.101.13', m4:'198.51.101.14' };
const DBS   = { m1:'mt-db1', m2:'mt-db2', m3:'mt-db3', m4:'mt-db4' };
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
class W{constructor(){const k=ec.genKeyPair();this.privateKey=k.getPrivate('hex');this.publicKey=k.getPublic('hex');
 this.sk=ec.keyFromPrivate(this.privateKey);this.ownMUID=bitcoin.payments.p2pkh({pubkey:Buffer.from(this.publicKey,'hex')}).address;
 const r=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 this.mailPubKey=r.publicKey;this.mailPrivKey=r.privateKey;}
 tok(){const reqId=crypto.randomUUID(),reqTime=Date.now(),t=`${this.ownMUID}-${reqTime}-${reqId}`;
  return{reqId,reqTime,Address:this.ownMUID,sesTok:t,pubKey:this.publicKey,sesSig:this.sk.sign(sha(t),'base64').toDER('hex')};}}
function post(cell,msg,w){const body=JSON.stringify({msg,borgToken:w.tok()});
 return new Promise(res=>{const r=https.request({host:CELLS[cell],port:13395,path:'/netREQ',method:'POST',rejectUnauthorized:false,
  headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},x=>{let raw='';x.on('data',d=>raw+=d);
  x.on('end',()=>{let j=null;try{j=JSON.parse(raw);}catch{};res({raw,json:j});});});
  r.on('error',e=>res({raw:String(e),json:null}));r.write(body);r.end();});}
const q=(k,s)=>execSync(`docker exec ${DBS[k]} mariadb -ushellfarmer -pshellfarmer -B -N -e ${JSON.stringify(s)}`,{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const A=new W(),B=new W(),C=new W();
  for (const [w,n] of [[A,'azA'],[B,'azB'],[C,'azC']]) await post('m1',{req:'registerInBox',nic:n,mailPubKey:w.mailPubKey},w);
  await sleep(1500);
  const key=(await post('m1',{req:'getInBoxKey',toMUID:B.ownMUID},A)).json.mailPubKey.replace(/\\n/g,'\n');
  const env=mailCrypto.sealMail(key,{from:A.ownMUID,to:B.ownMUID,msg:{subject:'authz probe',body:'authz body'}});
  await post('m1',{req:'sendMail',mail:{to:env.to,from:env.from,hash:env.hash,nCopys:4,envelope:env}},A);
  await sleep(2500);
  const cnt=()=>Object.fromEntries(Object.keys(DBS).map(k=>[k,Number(q(k,`select count(*) from mailTree.mailInBox where mbxHash='${env.hash}'`))]));
  const holders=Object.entries(cnt()).filter(([,n])=>n>0).map(([k])=>k);
  console.log('holders:',holders.join(','));
  let bad=0;
  for (const cell of Object.keys(CELLS)){
    const held = holders.includes(cell);
    const l  = await post(cell,{req:'listMyMail'},C);
    const g  = await post(cell,{req:'getMyMail',hash:env.hash},C);
    const sp = await post(cell,{req:'getMyMail',hash:env.hash,MUID:B.ownMUID},C);      // spoofed MUID in payload
    const dl = await post(cell,{req:'deleteMail',mail:{hash:env.hash},MUID:B.ownMUID},C); // spoofed delete
    await sleep(2500);
    const after=cnt();
    const gotMail = j => !!(j && j.mail && j.mail.some(m=>m.hash===env.hash));
    const leak = gotMail(l.json)||gotMail(g.json)||gotMail(sp.json);
    const rowsGone = Object.values(after).reduce((a,b)=>a+b,0) !== holders.length;
    if (leak||rowsGone) bad++;
    console.log(`${(leak||rowsGone)?'FAIL':'PASS'} askedCell=${cell} (holdsCopy=${held}) listNRecs=${l.json&&l.json.nRecs} getLeak=${gotMail(g.json)} spoofLeak=${gotMail(sp.json)} spoofDeleteNDeleted=${dl.json&&dl.json.nDeleted} rows=${JSON.stringify(after)}`);
  }
  console.log(bad===0?'AUTHZ OK: third MUID got nothing and deleted nothing on every cell':`${bad} CELL(S) LEAKED`);
})();
