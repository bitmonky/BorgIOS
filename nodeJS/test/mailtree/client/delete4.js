/*
  Reproduces the suite's item-9 scenario: send + resend (which can leave a 4th
  copy on the cell that received the send), then delete through a holder cell
  and check every DB. Repeats N times.
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
  const N=Number(process.env.N||3);
  const A=new W(),B=new W();
  await post('m1',{req:'registerInBox',nic:'a4',mailPubKey:A.mailPubKey},A);
  await post('m1',{req:'registerInBox',nic:'b4',mailPubKey:B.mailPubKey},B);
  await sleep(1500);
  const key=(await post('m1',{req:'getInBoxKey',toMUID:B.ownMUID},A)).json.mailPubKey.replace(/\\n/g,'\n');
  for (let i=0;i<N;i++){
    const env=mailCrypto.sealMail(key,{from:A.ownMUID,to:B.ownMUID,msg:{subject:'d4 '+i,body:'d4 body '+i}});
    const s1=await post('m1',{req:'sendMail',mail:{to:env.to,from:env.from,hash:env.hash,nCopys:3,envelope:env}},A);
    await sleep(1200);
    const s2=await post('m1',{req:'sendMail',mail:{to:env.to,from:env.from,hash:env.hash,nCopys:3,envelope:env}},A);
    await sleep(1200);
    const holders=Object.keys(DBS).filter(k=>q(k,`select count(*) from mailTree.mailInBox where mbxHash='${env.hash}'`)!=='0');
    const ask=holders[Math.min(1,holders.length-1)];
    const d=await post(ask,{req:'deleteMail',mail:{hash:env.hash}},B);
    await sleep(2500);
    const left=Object.keys(DBS).map(k=>k+':'+q(k,`select count(*) from mailTree.mailInBox where mbxHash='${env.hash}'`));
    console.log(`round${i} send nStored=${s1.json.nStored}/resend ${s2.json.nStored} copies=${holders.length}(${holders.join(',')}) deleteVia=${ask} nDeleted=${d.json.nDeleted} left=${left.join(' ')}`);
  }
})();
