/*
  Delete matrix: for every cell, store a copy on ALL cells (nCopys=4), then ask
  that cell to delete and check nDeleted + rows left on every DB.
  Isolates "does the cell that receives deleteMail also delete/count its OWN copy".
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
const CONT={m1:'mt-m1',m2:'mt-m2',m3:'mt-m3',m4:'mt-m4'};
// A cell that is the PeerTree ROOT never receives its own bcast (MkyRouting.bcast
// only sends up to the root and down to children), so probe the role.
function isRoot(cell){
  try{const rep=execSync(`docker exec ${CONT[cell]} sh -c 'curl -sk "https://127.0.0.1:13394/netREQ/msg=%7B%22req%22%3A%22x%22%2C%22what%22%3A%22getNode%22%7D"'`,{encoding:'utf8'});
    const j=JSON.parse(rep); return j.ip===j.r.rootNodeIp;}catch(e){return 'probeFailed';}
}
(async()=>{
  const nCopys=Number(process.env.NCOPYS||4);
  const A=new W(),B=new W();
  await post('m1',{req:'registerInBox',nic:'dmA',mailPubKey:A.mailPubKey},A);
  await post('m1',{req:'registerInBox',nic:'dmB',mailPubKey:B.mailPubKey},B);
  await sleep(1500);
  const key=(await post('m1',{req:'getInBoxKey',toMUID:B.ownMUID},A)).json.mailPubKey.replace(/\\n/g,'\n');
  let fails=0;
  for (const ask of Object.keys(CELLS)){
    const env=mailCrypto.sealMail(key,{from:A.ownMUID,to:B.ownMUID,msg:{subject:'dm '+ask,body:'dm body '+ask}});
    const sendVia = ask==='m1' ? 'm2' : 'm1';
    const s=await post(sendVia,{req:'sendMail',mail:{to:env.to,from:env.from,hash:env.hash,nCopys,envelope:env}},A);
    await sleep(2000);
    const holders=Object.keys(DBS).filter(k=>q(k,`select count(*) from mailTree.mailInBox where mbxHash='${env.hash}'`)!=='0');
    const root=isRoot(ask);
    const d=await post(ask,{req:'deleteMail',mail:{hash:env.hash}},B);
    await sleep(3000);
    const cnt=Object.fromEntries(Object.keys(DBS).map(k=>[k,Number(q(k,`select count(*) from mailTree.mailInBox where mbxHash='${env.hash}'`))]));
    const left=Object.values(cnt).reduce((a,b)=>a+b,0);
    const askIsHolder=holders.includes(ask);
    const ok = left===0 && d.json.nDeleted===holders.length;
    if(!ok) fails++;
    console.log(`${ok?'PASS':'FAIL'} deleteVia=${ask} (holder=${askIsHolder} isRoot=${root}) nStored=${s.json.nStored} holders=${holders.join(',')} nDeleted=${d.json.nDeleted} rowsLeft=${JSON.stringify(cnt)}`);
  }
  console.log(fails===0?'ALL DELETE MATRIX ROUNDS PASSED':`${fails} ROUND(S) FAILED`);
})();
