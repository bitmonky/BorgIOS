/*
BitMonky PeerTree Login Verification Server
*/
const config = require('./config.js');
const https = require('https');
const fs = require('fs');
const bitcoin = require('bitcoinjs-lib');

const options = {
  key: fs.readFileSync('/mkyNode/keys/privkey.pem'),
  cert: fs.readFileSync('/mkyNode/keys/fullchain.pem')
};

const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

var server = https.createServer(options, (req, res) => {

  if (req.url == '/keyGEN'){
    res.writeHead(200);
    // Generate a new key pair and convert them to hex-strings
    const key = ec.genKeyPair();
    const publicKey = key.getPublic('hex');
    const privateKey = key.getPrivate('hex');
    const ownAddr =  bitcoin.payments.p2pkh({ pubkey: new Buffer.from(''+publicKey, 'hex') }).address; 
    console.log('pub key length' + publicKey.length,publicKey);
    console.log('priv key length' + privateKey.length,publicKey);
    res.end('{"ownMUID":"'+ownAddr+'","publicKey":"' + publicKey + '","privateKey":"' + privateKey + '"}');
  }
  else {
    if (req.url.indexOf('/netREQ') == 0){
      if (req.method == 'POST') {
        var body = '';
        req.on('data', (data)=>{
          body += data;
          // Too much POST data, kill the connection!
          //console.log('body.length',body.length);
          if (body.length > 300000000){
            console.log('max datazize exceeded');
            req.connection.destroy();
          }
        });
        req.on('end', ()=>{
          var j = null;
          try {
            j = JSON.parse(body);
          }
          catch(err){
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
	    res.end('{"result":"json parse error:","data","'+body+'"}');
	    console.log('json error : ',body);
            return;
	  }	 
	  res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          if (j.msg.req == 'verifyLogin'){
            verifyLogin(j.msg.login,res);
            return;
	  }	      

	  res.end('{"netReq":"action '+j.msg.req+' not found"}');
        });
      }
    }  
    else {
      res.end('Wellcome To The BitMonky Proxy Server\nUse end point /netREQ\n');
    }
  }
});

server.listen(13380);
console.log('Server mkyProx.2 running at admin.bitmonky.com:13380');

function  retEr(msg,res){
  res.end('{"result":false,"erMsg":"'+msg+'"}\n');
}
function verifyLogin(j,res){
  console.log('verify:->',j);
  if (!j.pubKey) {
    console.log('pubkey is missing',j.pubKey);
    retEr('Public Key Is Misssing',res);
    return false;}

  if (!j.sig || j.sig.length === 0) {
    retEr('No signature found',res);
    return false;
  }

  // check public key matches the remotes address
  var mkybc = bitcoin.payments.p2pkh({ pubkey: new Buffer.from(''+j.pubKey, 'hex') });
  if (j.ownMUID !== mkybc.address){
  console.log('remote wallet address does not match publickey',j.ownMUID);
    retEr('No Address Not Matching Public Key:'+mkybc.address+'-'+j.ownMUID,res);
    return false;
  }
  const publicKey = ec.keyFromPublic(j.pubKey, 'hex');
  const msgHash   = calculateHash(j.sesTok);
  const rj = {
    result : publicKey.verify(msgHash, j.sig),
    msg : 'keyVerificationComplete'
  };
  res.end(JSON.stringify(rj));
}
function  calculateHash(txt) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(txt).digest('hex');
}
function proxGetData(j,res){
  const https = require('https')
  const options = {
    hostname: j.domain,
    port: 443,
    path: '/'+j.path,
    method: 'GET'
  };
  console.log('https://'+options.hostname+options.path);
  const req = https.request(options, reply => {
    var  doc = null
    reply.on('data', d => {
      doc = doc + d;
    });
    reply.on ('end',d =>{
      const  rsp = {
        result: true,
        txt: doc
      };
      res.end(JSON.stringify(rsp));
    })
  });

  req.on('error', error => {
    res.end('{"result":false}');
  })

  req.end();

}
