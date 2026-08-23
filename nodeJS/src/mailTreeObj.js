
/******************************************************************
PeerTree - Object mailTreeObj  

2023-0109 - Taken from mailTreeObj.js to be modified into the mailTreeObj 
*/

//const config        = require('./config.js');
var dateFormat        = require('./mkyDatef');
const EventEmitter    = require('events');
const https           = require('https');
const fs              = require('fs');
const EC              = require('elliptic').ec;
const ec              = new EC('secp256k1');
const bitcoin         = require('bitcoinjs-lib');
const crypto          = require('crypto');
const mysql           = require('mysql');
const schedule        = require('node-schedule');
const {MkyWebConsole} = require('./networkWebConsole.js');
const {pcrypt}        = require('./peerCrypt');
const {BorgECMail}    = require('./BorgECMail.js');

addslashes  = require ('./addslashes');

const algorithm = 'aes256';

function encrypt(buffer,pword){
  pword = pword.substr(0,31);
  var cipher = crypto.createCipher(algorithm,pword);
  var crypted = Buffer.concat([cipher.update(buffer),cipher.final()]);
  return crypted; //.toString('base64');
}
 
function decrypt(buffer,pword){
  pword = pword.substr(0,31);
  var decipher = crypto.createDecipher(algorithm,pword);
  var dec = Buffer.concat([decipher.update(buffer) , decipher.final()]);
  return dec;
}
function calculateHash(txt) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(txt).digest('hex');
}
// Content address of a sealed mail envelope. Must match the client side
// (borgHUImailCrypto.mailHash) so every copy lands under the same hash.
function sealedMailHash(env){
  return crypto.createHash('sha256')
    .update(`${env.wrappedKey}${env.ct}${env.tag}`,'utf8')
    .digest('hex');
}
// Every date this cell stores comes from its own clock, which peerTree.js has
// already corrected to cronoTree unified time -- never from the database, whose
// now() is the DB host's uncorrected clock.
function cellTime(){
  return new Date().toISOString().slice(0,19).replace('T',' ');
}
function deriveKey(password) {
    const salt = crypto.randomBytes(16); // Generate a random salt for additional security
    const iterations = 100000; // More iterations = stronger security
    const keyLength = 32; // AES-256 requires a 256-bit key (32 bytes)
    const digest = 'sha256'; // Hashing algorithm used in PBKDF2

    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
    return { key: derivedKey.toString('hex'), salt: salt.toString('hex') };
}

// Example usage
const bitcoinAddress = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"; // Example Bitcoin address
const derived = deriveKey(bitcoinAddress);

console.log("Derived Key:", derived.key);
console.log("Salt:", derived.salt);
/*********************************************
PeerMail Receptor Node: listens on port 1335
==============================================
This port is used for your regular apps to interact
with a mailTreeCell on the mailTree message network;
*/
const ftreeRoot = 'ftree/';

class peerMailToken{
   constructor(){
      this.publicKey   = null;
      this.privateKey  = null;
      this.signingKey  = null;
      this.openWallet();
   }
   calculateHash(txt) {
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(txt).digest('hex');
   }
   signToken(token) {
      const sig = this.signingKey.sign(calculateHash(token), 'base64');
      const hexSig = sig.toDER('hex');
      return hexSig;
   }   
   openWallet(){
      var keypair = null;
      try {keypair =  fs.readFileSync('keys/peerMailToken.key');}
      catch {console.log('no wallet file found');}
      this.publicKey = null;
      if (keypair){
        try {
	  const pair = keypair.toString();
	  const j = JSON.parse(pair);
          this.publicKey     = j.publicKey;
          this.privateKey    = j.privateKey;
          this.mailOwnMUID  = j.mailOwnMUID;
	  this.mailCipher   = j.mailCipher;
          this.crypt         = new pcrypt(this.mailCipher);
          this.signingKey    = ec.keyFromPrivate(this.privateKey);
        }
        catch(err) {console.log('wallet file not valid', err);process.exit();
	}
      }
      else {
        const key = ec.genKeyPair();
        this.publicKey = key.getPublic('hex');
        this.privateKey = key.getPrivate('hex');

        console.log('Generate a new wallet key pair and convert them to hex-strings');
        var mkybc = bitcoin.payments.p2pkh({ pubkey: new Buffer.from(''+this.publicKey, 'hex') });
        this.branchMUID = mkybc.address;

        const pmc = ec.genKeyPair();
        this.pmCipherKey  = pmc.getPublic('hex');

        console.log('Generate a new wallet cipher key');
        mkybc = bitcoin.payments.p2pkh({ pubkey: new Buffer.from(''+this.pmCipherKey, 'hex') });
        this.mailCipher = mkybc.address;

        var wallet = '{"mailOwnMUID":"'+ this.branchMUID+'","publicKey":"' + this.publicKey + '","privateKey":"' + this.privateKey + '",';
        wallet += '"mailCipher":"'+this.mailCipher+'"}';
        console.log(wallet);
	fs.writeFile('keys/peerMailToken.key', wallet, function (err) {
          if (err) throw err;
         //console.log('Wallet Created And Saved!');
        });
      } 
    } 
}; 

class mailTreeCellReceptor{
  constructor(peerTree,recPort){
    this.peer = peerTree;
    this.port = recPort;
    this.allow = ["127.0.0.1"];
    
    this.readConfigFile();
    this.activeNodes = [];
    console.log('ATTACHING - cellReceptor on port'+recPort);
    console.log('GRANTING cellRecptor access to :',this.allow);
    this.results = ['empty'];
    const options = {
      key: fs.readFileSync('keys/privkey.pem'),
      cert: fs.readFileSync('keys/fullchain.pem')
    };
    this.mailToken = new peerMailToken();
    console.log(this.mailToken);
    var bserver = https.createServer(options, (req, res) => {
      if (req.url == '/keyGEN'){
        // Generate a new key pair and convert them to hex-strings
        const key = ec.genKeyPair();
        const publicKey = key.getPublic('hex');
        const privateKey = key.getPrivate('hex');
        console.log('pub key length' + publicKey.length,publicKey);
        console.log('priv key length' + privateKey.length,publicKey);
        res.writeHead(200);
        res.end('{"publicKey":"' + publicKey + '","privateKey":"' + privateKey + '"}');
      }
      else {
        if (req.url.indexOf('/netREQ') == 0){
	  if (req.method == 'POST') {
            var body = '';
            req.on('data', (data)=>{
              body += data;
              // Too much POST data, kill the connection!
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
              if (this.checkBorgToken(j,res) === false){
                return;
              }
     
               console.log(`Heard j.msg`,j);
               j.msg.sig = {
                  ownMUID   : j.borgToken.Address, 
                  token     : j.borgToken.sesTok,
                  pubKey    : j.borgToken.pubKey,
                  signature : j.borgToken.sesSig
                }
              
              console.log(`Heard j.msg`,j.msg);

	      res.setHeader('Content-Type', 'application/json');
              res.writeHead(200);
              if (j.msg.req == 'findUsers'){
                this.reqQryBorgUsers(j.msg,res);
                return;
              }
              if (j.msg.req == 'findUserProfile'){
                this.reqQryBorgUserProfile(j.msg,res);
                return;
              }
              if (j.msg.req == 'getInBoxKey'){
                 this.reqInBoxKey(j.msg,res);
                 return;
              }
              if (j.msg.req == 'registerMyFarm'){
                this.reqRegisterMyFarm(j.msg,res);
                return;
              }
              if (j.msg.req == 'qryMyFarms'){
                this.reqQryMyFarms(j.msg,res);
                return;
              }
              if (j.msg.req == 'registerInBox'){
                this.reqRegisterInBox(j.msg,res);
                return;
              }
              if (j.msg.req == 'sendMail'){
                this.reqStoreMail(j.msg,res);
                return;
	      }	      
              if (j.msg.req == 'listMyMail'){
                this.reqListMyMail(j.msg,res);
                return;
              }
              if (j.msg.req == 'getMyMail'){
                this.reqRetrieveMail(j.msg,res);
                return;
              }
              if (j.msg.req == 'deleteMail'){
                this.reqDeleteMail(j.msg,res);
                return;
              }

	      res.end('{"netReq":"action '+j.msg.req+' not found"}');
            });
          }
	}	
        else {
          res.end('Wellcome To The PeerTree KeyGEN Server\nUse end point /keyGEN to request key pair');
        }
      }
    });
  
    bserver.on('connection', (sock)=> {
      if (this.allow.indexOf(sock.remoteAddress) < 0){
        //sock.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      } 
    });
    bserver.listen(this.port);
    console.log('peerTree Mail Receptor running on port:'+this.port);
  }
  checkBorgToken(j,res) {

    let doTry = this.peer.net.verifyLogin(j);
    if (doTry.result === true){
      return true;
    }
    // Reject Request.
    console.log(`checkBorgToken():: doTry`,doTry,j);
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(450);
    res.end(`{"result":false,"error": "Invalid BorgToken Request Rejected","msg":"${doTry.msg}"}`);
    return false;
  }
  readConfigFile(){
     var conf = null;
     try {conf =  fs.readFileSync('keys/mailTree.conf');}
     catch {console.log('no config file found');}
     if (conf){
       try {
         conf = conf.toString();
         const j = JSON.parse(conf);
         this.port   = j.receptor.port;
         this.allow  = j.receptor.allow;
       }
       catch(err) {
         console.log('conf file not valid', err);
       }
     }
  }
  openMailKeyFile(j){
    const bitToken = bitcoin.payments.p2pkh({ pubkey: new Buffer.from(''+this.mailToken.publicKey, 'hex') }); 
    var mToken = {
      publicKey   : this.mailToken.publicKey,
      ownMUID     : bitToken.address,
      privateKey  : '************' // create from public key using bitcoin wallet algorythm.
    };
    return mToken;
  }
  // Only the addressee can delete: the MUID comes from the verified borgToken,
  // never from the payload.
  async reqDeleteMail(j,res){
    const nGone = await this.peer.receptorReqDeleteMyMail({
      MUID : j.sig.ownMUID,
      hash : j.mail?.hash || null,
      sig  : j.sig
    });
    res.end(JSON.stringify({result : nGone > 0, nDeleted : nGone}));
  }
  bufferToBase64(arr){
    var i, str = '';
    for (i = 0; i < arr.length; i++) {
      str += '%' + ('0' + arr[i].toString(16)).slice(-2);
    }
    return decodeURIComponent(str);
  }
  /* Registry lookup. Returns both keys the network holds for a client MUID:
     pubKey     - EC key the client signs requests with
     mailPubKey - RSA key senders wrap message keys to
     Missing registration answers result:false, so a sender fails closed
     instead of posting something a cell could read. */
  async reqInBoxKey(j,res){
    const keys = await this.peer.receptorReqInBoxKey(j);
    if (keys && (keys.publicKey || keys.mailPubKey)){
      res.end(JSON.stringify({
        result     : true,
        pubKey     : keys.publicKey || null,
        mailPubKey : keys.mailPubKey || null
      }));
      return;
    }
    res.end(JSON.stringify({result:false}));
  }
  // Inbox listing: broadcast for cells holding mail for this MUID, they answer
  // with the sealed envelopes. Nothing here can read them.
  async reqListMyMail(j,res){
    const mail = await this.peer.receptorReqSendMyMail({
      MUID : j.sig.ownMUID,
      hash : j.mail?.hash || null,
      sig  : j.sig
    });
    res.end(JSON.stringify({result:true,nRecs:mail.length,mail:mail}));
  }
  async reqQryBorgUserProfile(j,res){
     const msg = {
       to      : 'mailCells',
       req     : 'sendUserProfile',
       reqId   : crypto.randomUUID(),
       ownMUID : j.ownMUID,
     }
     const result = await this.peer.doQryBorgUserProfile(msg);
     res.end(JSON.stringify({result:true,tRec : result}));
     return;
  }
  async reqQryBorgUsers(j,res){
     const msg = {
       to    : 'mailCells',
       req   : 'sendMatchingUsers',
       reqId : crypto.randomUUID(),
       qry   : j.qry,
       max   : j.maxRows
     }
     const result = await this.peer.doQryBorgUsers(msg);
     res.end(JSON.stringify({result:true,tRec : result}));
     return;
  }
  async reqRegisterInBox(j,res){
    console.log(`reqRegisterInBox():: heard j`,j);
    j.ownMUID  = j.sig.ownMUID;
    let maxIPs = j.nCopies || 3;
    j.nCopies  = maxIPs;

    let regIPs = await this.peer.receptorReqInBoxKeyIPs(j);
    if (regIPs.length === 0){
      regIPs = await this.peer.receptorReqNodeList(j);
      if (regIPs.length == 0){
        console.log(`reqRegisterInBox():: no available`,regIPs);
        res.end('{"result":false,"nRecs":0,"repo":"No Nodes Available"}');
        return;
      }
    }
    if (regIPs < maxIPs){
      let IPs = await this.peer.receptorReqNodeList(j,regIps);
      IPs.forEach((ip) => { regIPs.push(ip);});
    }
    var n = 0;
    var hosts = [];
    var nStored = 0;
    for (var IP of regIPs){
      try {
        var qres = await this.peer.receptorReqRegisterInBox(j,IP);
        if (qres){
          nStored = nStored +1;
          hosts.push({host:qres.remMUID,ip:qres.remIp});
        }
      }
      catch(err) {
        console.log('Borg User Update failed on:',IP,err);
      }
      if (n === regIPs.length -1){
        console.log('{"result":"regOK","nStored":'+nStored+',"request":'+JSON.stringify(j)+',"hosts":'+JSON.stringify(hosts)+'}');
        res.end('{"result":true,"nStored":'+nStored+'}');
        return;
      }
      n = n + 1;
    }   
    return;
  } 
  async reqQryMyFarms(j,res){
    console.log(`reqQryMyFarms():: heard j`,j);
    j.ownMUID  = j.sig.ownMUID;

    let regIPs = await this.peer.receptorReqMyFarmIPs(j.IP);
    if (regIPs.length === 0){
      console.log(`reqQryMyFarms():: no available`,regIPs);
      res.end('{"result":false,"nRecs":0,"msg":"No Farms Found.. Try later"}');
      return;
    }
    res.end('{"result":true,"nRecs":reqIPs.length,farms:reqIPs,"msg":"Farms Found...OK"}');
  }
  async reqRegisterMyFarm(j,res){
    console.log(`reqRegisterInBox():: heard j`,j);
    j.ownMUID  = j.sig.ownMUID;
    j.date     = new Date(Date.now()).toISOString().slice(0, 19).replace('T', ' ');
    let maxIPs = j.nCopies || 3;
    j.nCopies  = maxIPs;

    let regIPs = []; // needs to be an IP look up for any existing farm of the same IP NOT...await this.peer.receptorReqMyFarmIPs(j);
                     // if any are found the reject the registration.

    if (regIPs.length === 0){
      regIPs = await this.peer.receptorReqNodeList(j);
      if (regIPs.length == 0){
        console.log(`reqRegisterMyFarm():: no available`,regIPs);
        res.end('{"result":false,"nRecs":0,"repo":"No Nodes Available"}');
        return;
      }
    }
    if (regIPs < maxIPs){
      let IPs = await this.peer.receptorReqNodeList(j,regIps);
      IPs.forEach((ip) => { regIPs.push(ip);});
    }
    var n = 0;
    var hosts = [];
    var nStored = 0;
    for (var IP of regIPs){
      try {
        var qres = await this.peer.receptorReqRegisterMyFarm(j,IP);
        if (qres){
          nStored = nStored +1;
          hosts.push({host:qres.remMUID,ip:qres.remIp});
        }
      }
      catch(err) {
        console.log('Borg Farmer Update failed on:',IP,err);
      }
      if (n === regIPs.length -1){
        console.log('{"result":"regOK","nStored":'+nStored+',"request":'+JSON.stringify(j)+',"hosts":'+JSON.stringify(hosts)+'}');
        res.end('{"result":true,"nStored":'+nStored+'}');
        return;
      }
      n = n + 1;
    }
    return;
  }
  async reqRegisterInbox(j, res) {
    try {
        const IPs = await this.peer.receptorReqNodeList(j);
        if (IPs.length === 0) {
            res.end('{"result":false,"nRecs":0,"repo":"No Nodes Available"}');
            return;
        }

        let nStored = 0;
        const hosts = [];
        
        // Use Promise.all for parallel execution of requests
        await Promise.all(IPs.map(async (IP) => {
            try {
                const qres = await this.peer.receptorReqRegisterInBox(j, IP);
                if (qres) {
                    nStored += 1;
                    hosts.push({ host: qres.remMUID, ip: qres.remIp });
                }
            } catch (err) {
                console.log('repo storage failed on:', IP);
            }
        }));

        // Send response after all requests are completed
        res.end(`{"result":true,"nStored":${nStored},"repo":${JSON.stringify(j)},"hosts":${JSON.stringify(hosts)}}`);
    } catch (err) {
        console.error('Error processing request:', err);
        res.end('{"result":false,"error":"An error occurred"}');
    }
  }
  async reqRetrieveMail(j,res){
    const stime = Date.now();
    const mail  = await this.peer.receptorReqSendMyMail({
      MUID : j.sig.ownMUID,
      hash : j.mail?.hash || null,
      sig  : j.sig
    });
    console.log('Mail Request Time: ',Date.now() - stime);
    if (mail.length === 0){
      res.end('{"result" : 0, "msg" : "no results found"}');
      return;
    }
    res.end(JSON.stringify({result:1,nRecs:mail.length,mail:mail}));
  }
  signRequest(j){
    const stoken = j.mail.token.ownMUID + new Date(); 
    const sig = {
      ownMUID : j.mail.token.ownMUID,
      token : stoken,
      pubKey : this.mailToken.publicKey,
      signature : this.mailToken.signToken(stoken)
    }
    return sig;
  }
  /* Sealed mail: the client encrypted the body with a one-time message key and
     wrapped that key to the recipient's registry key, so this cell only picks
     the holders and hands the envelope on unchanged. */
  reqStoreSealedMail(j,res){
    const mail = j.mail;
    const env  = mail.envelope;

    if (env.from !== j.sig.ownMUID){
      res.end('{"result":false,"mail":"envelope sender does not match the signed request"}');
      return;
    }
    if (!env.to){
      res.end('{"result":false,"mail":"envelope has no recipient"}');
      return;
    }
    const hash = sealedMailHash(env);
    if (mail.hash && mail.hash !== hash){
      res.end('{"result":false,"mail":"envelope hash does not match its contents"}');
      return;
    }
    // Carry the sender's own signature to the holders: they verify the sender,
    // not this cell.
    const payload = {
      to       : env.to,
      from     : env.from,
      hash     : hash,
      envelope : env,
      sig      : j.sig
    };
    const nCopys = Math.max(1,Math.min(Number(mail.nCopys) || 3, 10));

    var SQL = "SELECT mcelAddress FROM mailTree.mailCells ";
    SQL += "where mcelLastStatus = 'online' and  timestampdiff(second,mcelLastMsg,'"+cellTime()+"') < 50 order by rand() limit "+nCopys;
    con.query(SQL,async (err, result, fields)=> {
      if (err) {
        console.log(err);
        res.end('{"result":false,"nStored":0,"mail":"mail cell query failed"}');
        return;
      }
      if (result.length == 0){
        res.end('{"result":false,"nStored":0,"mail":"No Nodes Available"}');
        return;
      }
      var nStored = 0;
      var hosts   = [];
      for (var rec of result){
        try {
          const qres = await this.peer.receptorReqStoreSealedMail(payload,rec.mcelAddress);
          if (qres){
            nStored = nStored + 1;
            hosts.push({host:qres.remMUID,ip:qres.remIp});
          }
        }
        catch(err) {
          console.log('mail storage failed on:',rec.mcelAddress);
        }
      }
      res.end(JSON.stringify({
        result  : nStored > 0,
        nStored : nStored,
        hash    : hash,
        hosts   : hosts,
        mail    : nStored > 0 ? 'mailOK' : 'no cell accepted the mail'
      }));
    });
  }
  reqStoreMail(j,res){
    if (j.mail?.envelope){
      this.reqStoreSealedMail(j,res);
      return;
    }
    if(j.mail.encrypt){
      j.mail.data = encrypt(j.mail.data,this.mailToken.mailCipher);
      j.mail.data = j.mail.data.toString('base64');
    }
    j.mail.token = this.openMailKeyFile(j);
    j.mail.signature = this.signRequest(j);
    var SQL = "SELECT mcelAddress FROM mailTree.mailCells ";
    SQL += "where mcelLastStatus = 'online' and  timestampdiff(second,mcelLastMsg,'"+cellTime()+"') < 50 order by rand() limit "+j.mail.nCopys;
    //console.log(SQL);
    var nStored = 0;
    con.query(SQL,async (err, result, fields)=> {
      if (err) {console.log(err);}
      else {
        if (result.length == 0){
          res.end('{"result":"mailOK","nRecs":0,"mail":"No Nodes Available"}');
          return;
	}	
        var n = 0;
	var hosts = [];
	for (var rec of result){ 
          try {
            var qres = await this.peer.receptorReqStoreMail(j,rec.mcelAddress);
            if (qres){
	      nStored = nStored +1;
	      hosts.push({host:qres.remMUID,ip:qres.remIp});	    
	    }    
          }
	  catch(err) {
            console.log('mail storage failed on:',rec.mcelAddress);
          }
          if (n==result.length -1){
            j.mail.token.privateKey = '**********';
            j.mail.token.publicKey  = '**********';
            res.end('{"result":"mailOK","nStored":'+nStored+',"mail":'+JSON.stringify(j)+',"hosts":'+JSON.stringify(hosts)+'}');
	  }	
          n = n + 1;
	}
      } 		  
    });
  }
};
/*----------------------------
End Receptor Code
==============================
*/
var dba = null
try {dba =  fs.readFileSync('dbconf');}
catch {console.log('database config file `dbconf` NOT Found.');}
try {dba = JSON.parse(dba);}
catch {console.log('Error parsing `dbconf` file');}
let con = createConnection();

function createConnection() {
  const connection = mysql.createConnection({
    host:"127.0.0.1",
    user: dba.user,
    password: dba.pass,
    database: "mailTree",
    dateStrings: "date",
    multipleStatements: true,
    supportBigNumbers : true
  });
  connection.connect((err) => {
    if (err) {
      console.error('Error connecting to database:', err);
      setTimeout(createConnection, 2000); // Retry connection
    } else {
      console.log('Connected to database');
    }
  });

  connection.on('error', (err) => {
    console.error('BORG:MySQL Error:', err);
    if (err.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' || err.code === 'ECONNRESET') {
      console.log('Reconnecting after fatal error...');
      connection.destroy();
      con = createConnection(); // Reconnect after fatal error
    }
  });

  return connection;
}

function heartbeat() {
  con.ping((err) => {
    if (err) {
      console.error('BORG::mySQL::Heartbeat failed, attempting to reconnect...', err);
      con.destroy();
      con = createConnection();
    }
  });
}
setInterval(heartbeat, 15000);
console.log('Heartbeat system initialized.');

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}
class mailTreeObj {
  constructor(peerTree,reset){
    this.reset      = reset;
    this.isRoot     = null;
    this.status     = 'starting';
    this.net        = peerTree;
    this.receptor   = null;
    this.wcon       = new MkyWebConsole(this.net,con,this,'mailTreeCell');
  }
  startCell(){
    this.init();
    this.setNetErrHandle();
    this.sayHelloPeerGroup();
  }
  attachReceptor(inReceptor){
    this.receptor = inReceptor;
  }	  
  setNetErrHandle(){
    this.net.on('mkyRejoin',(j)=>{
      console.log('Network Drop Detected',j);
      this.status = 'starting';
      this.init();
    });
  }
  async init(){
    if (this.reset){
      await this.resetDb(this.resetBlock);
    }
  }
  getGoldRate(){
    return new Promise( (resolve,reject)=>{
      const https = require('https');

      const pmsg = {msg : 'sendGoldRate'}
      const data = JSON.stringify(pmsg);

      const options = {
        hostname : 'www.bitmonky.com',
        port     : 443,
        path     : '/whzon/bitMiner/getGoldRate.php',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      }
      const req = https.request(options, res => {
        var rdata = '';
        res.on('data', d => {
          console.log(d);
          rdata += d;
        });
        res.on('end',()=>{
          var reply = null;
          console.log('getGold Rate returned',rdata);
          try {reply = JSON.parse(rdata);}
          catch(err) {reply = {mkyRate:0.0};}
          resolve(reply.mkyRate);
        });
      });

      req.on('error', error => {
        console.error(error)
        resolve(0.0);
      });

      req.write(data);
      req.end();
    });
  }
  receptorReqNodeList(j,excludeIps=[]){
    return new Promise( (resolve,reject)=>{
      console.log('receptorReqNodeList::',j);
      var mkyReply = null;
      const maxIP = j.nCopies || 3;
      
      var   IPs = [];
      const gtime = setTimeout( ()=>{
        console.log('Send Node List Request Timeout:');
        this.net.removeListener('mkyReply', mkyReply);
        resolve(IPs);
      },1.5*1000);

      const reqId = crypto.randomUUID();
      var req = {
        to     : 'mailCells',
        req    : 'sendNodeList',
        reqId  : reqId,
        nodes  : maxIP,
        xnodes : excludeIps,
        work   : crypto.randomBytes(20).toString('hex')
      }
      console.log(`receptorReqNodeList():: bcast`,req);
      this.net.broadcast(req);
      this.net.on('mkyReply', mkyReply = (r)=>{
        if (r.req === 'pNodeListGenIP'){
          console.log('mkyReply NodeGen is:',r.remIp);
          if (IPs.length <= maxIP && !IPs.includes(r.remIp)){
            console.log('mkyReply maxIP ${maxIP} NodeGen is: ',r.remIp);
            IPs.push(r.remIp);
          }
          else {
            //this.receptorReqStopIPGen(req.work);
            clearTimeout(gtime);
            this.net.removeListener('mkyReply', mkyReply);
            resolve(IPs);
          }
        }
      });
    });
  }
  doPowStop(remIp){
    this.net.gpow.doStop(remIp);
  }
  doPow(j,remIp){
    if (j.xnodes.includes(this.net.nIp)){
      return;
    }
    this.net.gpow.doPow(2,j.work,remIp);
  }
  updatePMailcellDB(j){
    //console.log('Reviewing PeerTree Nodes DB',j);
    var SQL = "SELECT count(*)nRec FROM mailTree.mailCells where mcelAddress = '"+j.remIp+"'";
    con.query(SQL,(err, result, fields)=> {
      if (err) console.log(err);
      else {
        if (result[0].nRec == 0){
          SQL = "insert into mailTree.mailCells (mcelAddress,mcelLastStatus,mcelLastMsg)";
          SQL += "values ('"+j.remIp+"','New','"+cellTime()+"')";
          con.query(SQL,(err, result, fields)=>{
            if (err) console.log(err);
          });
        }
	else {
          SQL = "update mailTree.mailCells set mcelLastStatus = 'online',mcelLastMsg = '"+cellTime()+"' ";
          SQL += "where mcelAddress = '"+j.remIp+"'";
          //console.log(SQL);
          con.query(SQL,(err, result, fields)=>{
            if (err) console.log(err);
          });
	}		
      }
    });
  }	  
  doNodesDBMaint(){
    console.log('Reviewing PeerTree Nodes DB',this.net.nodes);
    this.net.nodes.forEach((node) => {
      var SQL = "SELECT count(*)nRec FROM mailTree.mailCells where mcelAddress = '"+node.ip+"'";
      con.query(SQL, function (err, result, fields) {
        if (err) console.log(err);
        else {
          if (result[0].nRec == 0){
            SQL = "insert into mailTree.mailCells (mcelAddress,mcelLastStatus,mcelLastMsg)";
            SQL += "values ('"+node.ip+"','New','"+cellTime()+"')";
            con.query(SQL, function (err, result, fields) {
              if (err) console.log(err);
            });
          }
        }
      });
    });	    
  }	  
  resetDb(){
    return new Promise( (resolve,reject)=>{
      var SQL = "";
      SQL =  "truncate table mailTree.mailCells; ";
      SQL += "truncate table mailTree.mailOwners; ";
      SQL += "truncate table mailTree.mails; ";
      con.query(SQL, async (err, result, fields)=>{
        if (err) {console.log(err);reject(err);}
        else {
          resolve("OK");
        }
      });
    });
  }
  handleXhrError(j){
    if (!j.msg)
      return;    
    const msg = j.msg;
    if (msg.req == 'sendStatus'){
      var node = {
        ip      : j.toHost,
        status  : 'offline',
        lastMsg : null
      }
      this.group.updateGroup(node);
      return;
    }   
  }
  handleReq(remIp,j){
    //console.log('root recieved: ',j);
    if (j.req == 'registerInBox'){
      this.doRegisterInBox(j,remIp);
    }
    if (j.req == 'registerMyFarm'){
      this.doRegisterMyFarm(j,remIp);
    }
    if (j.req == 'pMailQryResult'){
      this.pushQryResult(j,remIp);
      return true;
    }
    if (j.req == 'storeMail'){
      this.storeMail(j,remIp);
      return true;
    }
    if (j.req == 'storeSealedMail'){
      this.storeSealedMail(j,remIp);
      return true;
    }
    if (j.req == 'gotUAddMe'){
      this.group.addPeer(j.me);
      this.net.endRes(res,'');
      return true;
    }
    if (j.req == 'sendStatus'){
      this.group.me.status = this.status;
      this.net.endRes(remIp,'{"statusUpdate":'+JSON.stringify(this.group.me)+'}');
      return true;
    }
    if (!this.isRoot && this.status != 'Online'){
      this.net.endRes(remIp,'');
      return true;
    }
    return false;
  }
  handleReply(r){
    if (r.req == 'helloBack'){
      this.receptor.activeNodes.push({mNodeID:r.mNodeID,IP:r.remIp});
      return;
    }
    if (r.statusUpdate){
      this.group.updateGroup(r.statusUpdate);
      return;
    }
  }
  handleBCast(j){
    //console.log('bcast received: ',j);
    if (!j.msg.to) {return;}
    if (j.msg.to == 'mailCells'){
      this.updatePMailcellDB(j);  
      if (j.msg.req){
        if (j.msg.req == 'hello'){
          var qres = {req : 'helloBack', mNodeID : this.net.peerMUID };
          this.net.sendReply(j.remIp,qres);
        }
        if (j.msg.req == 'sendInBoxKey'){
          this.doSendInBoxKey(j.msg,j.remIp);
        }
        if (j.msg.req == 'sendMyFarmIP'){
          this.doSendMyFarmIP(j.msg,j.remIp);
        }
        if (j.msg.req == 'sendMail'){
          this.doSendMailToOwner(j.msg,j.remIp);
        }
        if (j.msg.req == 'sendMyMail'){
          this.doSendMyMail(j.msg,j.remIp);
        }
        if (j.msg.req == 'deleteMyMail'){
          this.doDeleteMyMail(j.msg,j.remIp);
        }
        if (j.msg.req == 'deleteMail'){
          this.doDeleteMailByOwner(j.msg,j.remIp);
        }
        if (j.msg.req == 'sendNodeList'){
          console.log('DOPOW xxxx',j.remIp);
          this.doPow(j.msg,j.remIp);
        }
        if (j.msg.req == 'stopNodeGenIP'){
          console.log('DOPOW stopNodeGenIP-XX Received:',j.remIp);
          this.doPowStop(j.remIp);
        }
        if (j.msg.req === 'sendUserProfile'){
          this.doSendUserProfile(j.msg,j.remIp);
          return;
        }
        if (j.msg.req === 'sendMatchingUsers'){
          this.doSendUserQryResult(j.msg,j.remIp);
          return;
        }
      }
    } 
    return;
  }
  sayHelloPeerGroup(){
    var breq = {
      to  : 'mailCells',
      req : 'hello'
    }
    if (this.receptor){
      this.receptor.activeNodes = [];
    } else {console.log('Receptor Not Ready!',this.receptor);}

    this.net.broadcast(breq);
    const gtime = setTimeout( ()=>{
      this.sayHelloPeerGroup();
    },15*1000);
  }
  isValidSig(sig) {
    if (!sig){console.log('remMessage signature is null',sig);return false;}
    if (sig.hasOwnProperty('pubKey') === false) {console.log('remSig.pubKey is undefined',sig);return false;}
    if (!sig.pubKey) {console.log('remSig.pubKey is empty',sig);return false;}

    if (!sig.signature || sig.signature.length === 0) {
       return false;
    }

    // check public key matches the remotes address
    var mkybc = bitcoin.payments.p2pkh({ pubkey: new Buffer.from(''+sig.pubKey, 'hex') });
    if (sig.ownMUID !== mkybc.address){
      console.log('remote wallet address does not match publickey',sig);
      return false;
    }
    //verify the signature token with the public key
    const publicKey = ec.keyFromPublic(sig.pubKey,'hex');
    return publicKey.verify(calculateHash(sig.token), sig.signature);
  }
  doSendInBoxKey(j,remIp){
     console.log(`doSendInBoxKey`,j);
     var res = {
       req    : 'sendInBoxKeyResult',
       reqId  : j.reqId,
       result : false
     }
     if (this.isValidSig(j.sig)){
       //*store the public key and reply true
       const SQL = `select msubPubKey,msubMailPubKey from mailTree.mailSubscriber where msubMUID = ?`;
       con.query(SQL ,[j.MUID], (err, result,fields)=>{
         if (err){
           console.log(err);
           return;
         }
         else {
           if (result.length > 0){
             res.result = true;
             res.publicKey  = result[0].msubPubKey;
             res.mailPubKey = result[0].msubMailPubKey;
             this.net.sendReply(remIp,res);
           }
         }
       });
     }
     else {
       console.log('invalid signature... no access');
     }
   }
   doSendMyFarmIP(j,remIp){
     console.log(`doSendMyFarmIP`,j);
     var res = {
       req    : 'sendMyFarmIPResult',
       reqId  : j.reqId,
       result : false
     }
     if (this.isValidSig(j.sig)){
       //*store the public key and reply true
       const SQL = `select sregFarmerFIP from mailTree.shellFarmerRegistry where sregFarmerMUID = '${j.MUID}'`;
       console.log(SQL);
       con.query(SQL , (err, result,fields)=>{
         if (err){
           console.log(err);
           result.msg = err;
         }
         else {
           if (result.length > 0){
             res.result  = true;
             res.myFarmIPs = result;
             console.log(`doSendInBoxKey():: `,result);
             this.net.sendReply(remIp,res);
           }
         }
       });
     }
     else {
       console.log('invalid signature... no access to farm data');
     }
   }
   doRegisterMyFarm(j,remIp){
     var reply = {
       req    : 'registerMyFarmResult',
       reqId  : j.reqId,
       result : false
     }
     j = j.data;

     if (this.isValidSig(j.sig)){
       //*store or update the Borg User Mail Registry.
       const checkSQL = `SELECT sregFarmerMUID nRec FROM mailTree.shellFarmerRegistry WHERE sregFarmerFIP = ?`;

       con.query(checkSQL, [j.farmerFIP], (err, rows) => {
         if (err) {
           console.error("mailSubscriber pre-check error:", err);
           reply.msg = 'Register Farm DB error.. try later'; 
           this.net.sendReply(remIp, reply);
           return;
         }
         if (rows.length > 0){
           if (rows[0].farmerMUID !== j.farmerFIP){
             console.error("mailSubscriber pre-check error:", err);
             reply.msg = 'Farm Registered to another Shell Farmer... Check IP and try again';
             this.net.sendReply(remIp, reply);
             return;
           }
           reply.msg = 'Farm Already Registered.';
           reply.result = true;
           this.net.sendReply(remIp, reply);
           return;
         }

         // Create New Farm Registration

         const values = [
           j.ownMUID,
           j.farm.IP,
           j.date
         ];

         const SQL = `INSERT into mailTree.shellFarmerRegistry (sregFarmerMUID,sregFarmerFIP,sregRegDate) values (?, ?, ?)`;
         console.log(`doRegisterMyFarm():: `,j,SQL,values);

         con.query(SQL ,values, (err, result,fields)=>{
           if (err){
             console.log(err);
             reply.msg = err;
           }
           else {
             reply.result = true;
           }
           this.net.sendReply(remIp,reply);
         });
       });
     }
     else {
        reply.msg = 'invalid signature farm not created';
        this.net.sendReply(remIp,reply);
     }     
   }
   doRegisterInBox(j,remIp){
     var reply = {
       req    : 'registerInBoxResult',
       reqId  : j.reqId,
       result : false
     }
     j = j.data;

     if (this.isValidSig(j.sig)){
       //*store or update the Borg User Mail Registry.
       const checkSQL = `SELECT msubID FROM mailTree.mailSubscriber WHERE msubMUID = ?`;

       con.query(checkSQL, [j.sig.ownMUID], (err, rows) => {
         if (err) {
           console.error("mailSubscriber pre-check error:", err);
           this.net.sendReply(remIp, reply);
           return;
         }
         const values = [
           j.icon?.fname  || null,
           j.icon?.fcsum  || null,
           j.icon?.rname  || null,
           j.icon?.folder || null,
           j.icon?.path   || null,
           j.icon?.ftype  || null,
           j.nic          || null,
           j.mailPubKey   || null,
           j.sig.ownMUID
         ];

         if (rows.length > 0) {
           // -----------------------------------------
           // USER EXISTS → UPDATE
           // -----------------------------------------
           // coalesce: a client that has not sent a mail key yet must not wipe
           // the one already registered, or mail addressed to it stops sealing.
           const updateSQL = ` UPDATE mailTree.mailSubscriber SET msubIconFName  = ?, msubIconFCSum  = ?, msubIconRName  = ?, msubIconFolder = ?,
              msubIconPath   = ?, msubIconFType  = ?, msubBorgNic  = ?, msubMailPubKey = coalesce(?,msubMailPubKey)  WHERE msubMUID = ? `;

           con.query(updateSQL, values, (err2, result2) => {
             if (err2) {
               console.error("mailSubscriber update error:", err2);
             } else {
               reply.result = true;
             }
             this.net.sendReply(remIp, reply);
           });
 
         } else {
           const SQL = ` INSERT INTO mailTree.mailSubscriber (msubMUID, msubPubKey, msubMailPubKey, msubIconFName, msubIconFCSum, msubIconRName,
             msubIconFolder, msubIconPath, msubIconFType, msubBorgNic)  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
           const values = [
             j.sig.ownMUID,
             j.sig.pubKey,
             j.mailPubKey   || null,
             j.icon?.fname  || null,
             j.icon?.fcsum  || null,
             j.icon?.rname  || null,
             j.icon?.folder || null,
             j.icon?.path   || null,
             j.icon?.ftype  || null,
             j.nic          || null
           ];

           con.query(SQL ,values, (err, result,fields)=>{
             if (err){
               console.log(err);
               reply.msg = err;
             }
             else {
               reply.result = true;
             }
             this.net.sendReply(remIp,reply);
           });
         }
       });
     } 
     else {
        reply.msg = 'invalid signature mailBox not created';
        this.net.sendReply(remIp,reply);
     }  
  }
  doQryBorgUserProfile(msg) {
    return new Promise((resolve) => {
      const results = new Map();

      const mkyReply = (r) => {
        if (r.req === 'sendUserProfileResult' && r.reqId === msg.reqId) {
          if (r.result === true) {
            const rec = r.tRec;
            if (!rec.msubMUID) {
              if (rec.msubBorgNic === null) rec.msubBorgNic = `BORG-${rec.msubMUID.slice(0, 15)}`;
              console.log(`doQryBorgUserProfile():: setting `,rec.msubBorgNic);
            }
            this.net.removeListener("mkyReply", mkyReply);
            clearTimeout(gtime);
            resolve(rec);
          }

        }
      };

      const gtime = setTimeout(() => {
        console.log("Qry max time Timeout:");
        this.net.removeListener("mkyReply", mkyReply);

        // Convert to sorted array on timeout too
        const sorted = [...results.values()]
          .sort((a, b) => a.msubMUID.localeCompare(b.msubMUID));

          resolve(sorted);
      }, 900);

      // Avoid duplicate listeners
      this.net.removeListener("mkyReply", mkyReply);
      this.net.on("mkyReply", mkyReply);

      this.net.broadcast(msg);
    });
  }
  doQryBorgUsers(msg) {
    return new Promise((resolve) => {
      const results = new Map();

      const mkyReply = (r) => {
        if (r.req === 'sendMatchingUsersResult' && r.reqId === msg.reqId) {
          if (r.result === true && Array.isArray(r.tRec)) {
            r.tRec.forEach((rec) => {
              if (!results.has(rec.msubMUID)) {
                if (rec.msubBorgNic === null) rec.msubBorgNic = `BORG-${rec.msubMUID.slice(0, 15)}`;
                console.log(`doQryBorgUsers():: setting `,rec.msubBorgNic);
                results.set(rec.msubMUID, rec);
              }
            });
          }

          // Stop early if we reached max
          if (results.size >= msg.max) {
            clearTimeout(gtime);
            this.net.removeListener("mkyReply", mkyReply);

            // Convert to sorted array
            const sorted = [...results.values()]
              .sort((a, b) => a.msubBorgNic.localeCompare(b.msubBorgNic));

            resolve(sorted);
          }
        }
      };

      const gtime = setTimeout(() => {
        console.log("Qry max time Timeout:");
        this.net.removeListener("mkyReply", mkyReply);

        // Convert to sorted array on timeout too
        const sorted = [...results.values()]
          .sort((a, b) => a.msubMUID.localeCompare(b.msubMUID));

          resolve(sorted);
      }, 300);

      // Avoid duplicate listeners
      this.net.removeListener("mkyReply", mkyReply);
      this.net.on("mkyReply", mkyReply);

      this.net.broadcast(msg);
    });
  }
  doSendUserProfile(j,remIp){
     var reply = {
       req    : 'sendUserProfileResult',
       reqId  : j.reqId,
       result : false
     }
     const SQL = `select * from mailSubscriber where msubMUID = ?`;
     const params = [j.ownMUID];
     console.log(`doSendUserProfile(j,remIp):: `,SQL,params);

     con.query(SQL ,params, async(err, result,fields)=>{
       if (err){
         console.log(err);
       }
       else {
         if (result.length == 0) {
           return;
         }
         reply.result = true;
         reply.tRec   = result[0];

         if (result.length > 0 ) this.net.sendReply(remIp,reply);
       }
     });
  }
  doSendUserQryResult(j,remIp){
     var reply = {
       req    : 'sendMatchingUsersResult',
       reqId  : j.reqId,
       result : false
     }
     const SQL = `select * from mailSubscriber where msubBorgNic like ? or msubBorgNic is null order by msubBorgNic limit ?`;
     const params = [`%${j.qry}%`,j.max];
     con.query(SQL ,params, async(err, result,fields)=>{
       if (err){
         console.log(err);
       }
       else {
         reply.result = true;
         reply.tRec   = result;

         if (result.length > 0 ) this.net.sendReply(remIp,reply);
       }
     }); 
  }

  doSendMailToOwner(j,remIp){
     //console.log('mail request from: ',remIp);
     //console.log('here is the req..',j);
     var SQL = "select sownID from mailTree.mailOwners where sownMUID = '"+j.mail.ownerID+"'";
     con.query(SQL , async(err, result,fields)=>{
       if (err){
         console.log(err);
       }
       else {
         var sownID = null;
         if (result.length == 0){
           console.log('Mail Owner Not Found On This Node.');
           return;
         }
         else {
           sownID = result[0].sownID;
           var fsdat = null;
	   const fname = ftreeRoot+sownID+'-'+j.mail.hash+'.srd'; 
           try {
             fsdat =  fs.readFileSync(fname);
	     var qres = {
               req : 'pMailDataResult',
               data : fsdat,
               qry : j
             }
             //console.log('sending mail result:',qres);
             this.net.sendReply(remIp,qres);
           }    
           catch (err) {
             console.log('error reading from srootTree:',err);
             //console.log('Wallet Created And Saved!');
           }
           return;
           var SQL = "select mailData from mailTree.mails where mailOwnerID = "+sownID+" and mailHash = '"+j.mail.hash+"'";
           //console.log(SQL);
           con.query(SQL, (err, result, fields)=> {
             if (err) console.log(err);
             else {
               if (result.length > 0){
                 var qres = {
                   req : 'pMailDataResult',
 	           data : result[0].mailData,
                   qry : j		   
                 }
                 //console.log('sending mail result:',qres);
		 this.net.sendReply(remIp,qres);
               } 
	       else {
		 console.log('Mail Not Stored On This Node.');
	       }
             }		    
           });
         }
       }
     });
  }
  /******************************************************
  Delete All Mail Files And Owner Record from this node
  =======================================================
  */
  doDeleteAllByOwner(j,remIp){

     if (!this.isValidSig(j.mail.signature)){
       console.log('Mail Signature Invalid... NOT deleted');
       return;
     }
     var SQL = "select sownID from mailTree.mailOwners where sownMUID = '"+j.mail.ownerID+"'";
     con.query(SQL , async(err, result,fields)=>{
       if (err){
         console.log('mail delete',err);
       }
       else {
         var sownID = null;
         if (result.length == 0){
           console.log('Mail Owner Not Found On This Node.');
           return;
         }
         else {
           sownID = result[0].sownID;
           var fsdat = null;
           const fname = ftreeRoot+sownID+'-*.srd';
           fs.unlink(fname, function (err) {
             if (err) {console.log('mail delete all.. File not found:',fname);}
             else {
               var SQL = "delete from mailTree.mailOwners where sownMUID = '"+j.mail.ownerID+"'";
               con.query(SQL , async(err, result,fields)=>{
                 if (err){
                   console.log('mail delete all fail',err);
                 }
	       });	       
               var qres = {
                 req : 'delAllMailsResult',
                 result : 1,
                 qry : j
               }
               //console.log('sending mail delete result:',qres);
               this.net.sendReply(remIp,qres);
             }
           });
           return;
         }
       }
     });
  }
  /******************************************************
  Delete Mail File Specified By Owner from this nodee
  =======================================================
  */
  doDeleteMailByOwner(j,remIp){
     if (!this.isValidSig(j.mail.signature)){
       console.log('Mail Signature Invalid... NOT deleted');
       return;
     }
     var SQL = "select sownID from mailTree.mailOwners where sownMUID = '"+j.mail.ownerID+"'";
     con.query(SQL , async(err, result,fields)=>{
       if (err){
         console.log('mail delete',err);
       }
       else {
         var sownID = null;
         if (result.length == 0){
           console.log('Mail Owner Not Found On This Node.');
           return;
         }
         else {
           sownID = result[0].sownID;
           var fsdat = null;
           const fname = ftreeRoot+sownID+'-'+j.mail.hash+'.srd';
           fs.unlink(fname, function (err) {
             if (err) {console.log('mail delete file not found:',fname);}
	     else {
	       var qres = {
                 req : 'pMailDeleteResult',
                 result : 1,
		 qry : j
               }
               //console.log('sending mail delete result:',qres);
               this.net.sendReply(remIp,qres);
             }
           });
           return;
         }
       }
     });
  }
  receptorReqInBoxKeyIPs(j){
    return new Promise( (resolve,reject)=>{
      const reqId = crypto.randomUUID();
      const IPs = [];
      let mkyReply = null;

      const gtime = setTimeout( ()=>{
        console.log('max reply time completed:',j,IPs);
        this.net.removeListener('mkyReply', mkyReply);
        resolve(IPs);
      },1000);
      
      const bcast = {
        to    : 'mailCells',
        req   : 'sendInBoxKey',
        reqId : reqId,
        MUID  : j.ownMUID,
        sig   : j.sig
      }
      console.log(`receptorReqInBoxKeyIPs():: `,bcast);
      this.net.broadcast(bcast);
      this.net.on('mkyReply',mkyReply = (r) =>{
        console.log('ptorReqInBoxKeyIPs():: heard:',r);
        if (r.req === 'sendInBoxKeyResult' && reqId === r.reqId){
          console.log('receptorReqInBoxKeyIPs():: mkyReply is:',r.remIp);
          IPs.push(r.remIp);
        }
      });
    });
  }
  receptorReqMyFarmIPs(j){
    return new Promise( (resolve,reject)=>{
      const reqId = crypto.randomUUID();
      let IPs = [];
      let mkyReply = null;

      const gtime = setTimeout( ()=>{
        console.log('max reply time completed:',j,IPs);
        this.net.removeListener('mkyReply', mkyReply);
        resolve(IPs);
      },1000);

      const bcast = {
        to    : 'mailCells',
        req   : 'sendMyFarmIP',
        reqId : reqId,
        MUID  : j.ownMUID,
        sig   : j.sig
      }
      console.log(`receptorReqMyFarmIPs():: `,bcast);
      this.net.broadcast(bcast);
      this.net.on('mkyReply',mkyReply = (r) =>{
        //console.log('recptorReqMyFarmPs():: heard:',r);
        if (r.req === 'sendMyFarmIPResult' && reqId === r.reqId){
          console.log('receptorReqMyFarmIPs():: mkyReply is:',r.remIp);
          IPs = [...new Set([...IPs, ...r.myFarmIPs])];
        }
      });
    });
  }
  receptorReqInBoxKey(j){
    return new Promise( (resolve,reject)=>{
      const reqId = crypto.randomUUID();
      let mkyReply = null;

      // A cell whose registry row predates the mail key still answers, so the
      // first reply is only kept as a fallback while waiting for one that
      // actually carries a mail key.
      let best = null;

      const gtime = setTimeout( ()=>{
        this.net.removeListener('mkyReply', mkyReply);
        if (!best) console.log('Request User InBoxKey Request Timeout:',j);
        resolve(best);
      },1000);

      const bcast = {
        to    : 'mailCells',
        req   : 'sendInBoxKey',
        reqId : reqId,
        MUID  : j.toMUID || j.ownMUID,
        sig   : j.sig
      }
      this.net.broadcast(bcast);
      this.net.on('mkyReply',mkyReply = (r) =>{
        //console.log('mkyReply is:',r);
        if (r.req == 'sendInBoxKeyResult' && reqId === r.reqId){
          if (r.result === true){
            if (!best) best = {publicKey : r.publicKey, mailPubKey : r.mailPubKey || null};
            if (!r.mailPubKey) return;
            best.mailPubKey = r.mailPubKey;
            this.net.removeListener('mkyReply', mkyReply);
            clearTimeout(gtime);
            resolve(best);
          } 
        }
      });
    });
  }
  receptorReqRegisterInBox(j,toIp){
    return new Promise( (resolve,reject)=>{
      let mkyReply = null;
     
      const gtime = setTimeout( ()=>{
        console.log('Register User InBox Request Timeout:',j);
        resolve(null);
      },1000);
      //console.log('bcasting reques for mail data: ',j);

      const reqId = crypto.randomUUID();

      var req = {
        to    : 'mailCells',
        req   : 'registerInBox',
        reqId : reqId,
        data  : j
      }

      this.net.sendMsg(toIp,req);
      this.net.on('mkyReply',mkyReply = (r) =>{
        //console.log('mkyReply is:',r);
        if (r.req === 'registerInBoxResult' && r.reqId === reqId){
          //console.log('mailData Request',r);
          clearTimeout(gtime);
          resolve(r);
        }
      });
    });
  }
  receptorReqRegisterMyFarm(j,toIp){
    return new Promise( (resolve,reject)=>{
      let mkyReply = null;

      const gtime = setTimeout( ()=>{
        console.log('Register User Farm Request Timeout:',j);
        resolve(null);
      },1000);
      //console.log('bcasting reques for mail data: ',j);

      const reqId = crypto.randomUUID();

      var req = {
        to    : 'mailCells',
        req   : 'registerMyFarm',
        reqId : reqId,
        data  : j
      }

      this.net.sendMsg(toIp,req);
      this.net.on('mkyReply',mkyReply = (r) =>{
        if (r.req === 'registerMyFarmResult' && r.reqId === reqId){
          clearTimeout(gtime);
          resolve(r);
        }
      });
    });
  }

  /* Mail retrieval: ask the whole mail group who is holding mail for this MUID.
     Every holder answers, so replies are collected for the full window and
     de-duplicated by envelope hash - the same mail lives on nCopys cells. */
  
  receptorReqSendMyMail(j){
    return new Promise( (resolve)=>{
      const reqId = crypto.randomUUID();
      const found = new Map();
      let mkyReply = null;

      setTimeout( ()=>{
        this.net.removeListener('mkyReply', mkyReply);
        resolve([...found.values()]);
      },675);

      const req = {
        to     : 'mailCells',
        req    : 'sendMyMail',
        reqId  : reqId,
        MUID   : j.MUID,
        hash   : j.hash || null,
        sig    : j.sig,
        origin : this.net.rnet?.myIp || null
      }

      const collect = (r) =>{
        if (r.req !== 'sendMyMailResult' || r.reqId !== reqId) return;
        for (const m of (r.mail || [])){
          const held = found.get(m.hash);
          if (held) {held.hosts.push(r.remIp); continue;}
          m.hosts = [r.remIp];
          found.set(m.hash,m);
        }
      };

      this.net.broadcast(req);
      this.net.on('mkyReply', mkyReply = collect);
      // This cell may hold mail too, and a broadcast never comes back to its
      // originator when that originator is the root, so read the local inbox
      // directly rather than waiting for an echo that may never arrive.
      this.doSendMyMail(req,null,(r)=>{
        r.remIp = this.net.rnet?.myIp || null;
        collect(r);
      });
    });
  }
  // Deletes every copy the group holds. Counts the rows cells confirmed gone.
  receptorReqDeleteMyMail(j){
    return new Promise( (resolve)=>{
      const reqId = crypto.randomUUID();
      let nGone = 0;
      let mkyReply = null;

      setTimeout( ()=>{
        this.net.removeListener('mkyReply', mkyReply);
        resolve(nGone);
      },3*1000);

      const req = {
        to     : 'mailCells',
        req    : 'deleteMyMail',
        reqId  : reqId,
        MUID   : j.MUID,
        hash   : j.hash || null,
        sig    : j.sig,
        origin : this.net.rnet?.myIp || null
      }

      const collect = (r) =>{
        if (r.req === 'deleteMyMailResult' && r.reqId === reqId && r.result === true){
          nGone = nGone + (r.nDeleted || 0);
        }
      };

      this.net.broadcast(req);
      this.net.on('mkyReply', mkyReply = collect);
      // Delete this cell's own copy directly: it holds copies like any other,
      // and the root never receives its own broadcast.
      this.doDeleteMyMail(req,null,collect);
    });
  }
  // Hands one sealed envelope to one holder cell.
  receptorReqStoreSealedMail(mail,toIp){
    return new Promise( (resolve)=>{
      let mkyReply = null;
      const gtime = setTimeout( ()=>{
        console.log('Sealed Mail Store Timeout:',toIp);
        this.net.removeListener('mkyReply', mkyReply);
        resolve(null);
      },10*1000);

      const req = {
        req  : 'storeSealedMail',
        mail : mail
      }

      this.net.sendMsg(toIp,req);
      this.net.on('mkyReply', mkyReply = (r) =>{
        if (r.mailStorHash === mail.hash && r.remIp == toIp){
          this.net.removeListener('mkyReply', mkyReply);
          clearTimeout(gtime);
          resolve(r.mailStoreRes === true ? r : null);
        }
      });
    });
  }
  receptorReqStoreMail(j,toIp){
    //console.log('receptorReqStoreMail',j);
    return new Promise( (resolve,reject)=>{	  
      const gtime = setTimeout( ()=>{
        console.log('Store Request Timeout:');
        resolve(null);
      },10*1000);  
      console.log('Store Mail To: ',toIp);
      var req = {
        req : 'storeMail',
	mail : j.mail
      }

      this.net.sendMsg(toIp,req);
      this.net.once('mkyReply', r =>{
        if (r.mailStoreRes && r.remIp == toIp){
          //console.log('mailStoreRes OK!!',r);
          clearTimeout(gtime);
	  resolve(r);
        }		    
      });
    });
  }	
  createNewSOWN(sown){
    return new Promise((resolve,reject)=>{
      var SQL = "insert into mailTree.mailOwners (sownMUID) values ('"+sown+"');";
      SQL += "SELECT LAST_INSERT_ID() AS newSownID;";
      con.query(SQL , (err, result,fields)=>{
        if (err){
          console.log(err);
	  resolve(null);
        }
        else {
          resolve(result[0].newSownID);
        }
      });
    });
  }
  createInvoiceRec(sownID,hash,sig){
    var invSig = {
       token : sig.token,
       sig   : sig.signature
    }
    var SQL = "INSERT INTO `mailTree`.`mails` SET ?";
    var values = {
      mailOwnerID : sownID,
      mailHash    : hash,
      mailDate    : new Date(),
      mailExpire  : null,
      mailOwnSignature : JSON.stringify(invSig)
    };
    con.query(SQL ,values, (err, result,fields)=>{
      if (err){
        console.log(err);
      }
    });
  }
  /*****************************************************************
  Sealed mail held for a recipient
  ================================================================
  The envelope arrives already encrypted: this cell verifies the sender
  signed it, checks the content hash, and stores the blob verbatim. It
  holds no key that can open it.
  */
  storeSealedMail(j,remIp){
    const mail = j.mail || {};
    const env  = mail.envelope;

    const fail = (why)=>{
      console.log('sealed mail rejected:',why);
      this.net.endRes(remIp,JSON.stringify({mailStoreRes:false,mailStorHash:mail.hash||null,error:why}));
    }
    if (!env || !env.to || !env.from || !env.ct || !env.tag || !env.wrappedKey) return fail('envelope is incomplete');
    if (!this.isValidSig(mail.sig))         return fail('Invalid Signature For Request');
    if (mail.sig.ownMUID !== env.from)      return fail('signature does not match envelope sender');
    if (sealedMailHash(env) !== mail.hash)  return fail('envelope hash does not match its contents');

    const values = [
      env.to,
      env.from,
      mail.hash,
      JSON.stringify(env),
      JSON.stringify({token:mail.sig.token,pubKey:mail.sig.pubKey,signature:mail.sig.signature}),
      Number(env.date) || Date.now(),
      Date.now()
    ];
    // Same mail arriving twice (resend, or a second copy request) is not an
    // error: the hash is the identity, so keep the copy already held.
    // Both dates come from the cell's cronoTree-corrected clock, never the
    // database's own clock.
    const SQL = `INSERT INTO mailTree.mailInBox
      (mbxToMUID,mbxFromMUID,mbxHash,mbxEnvelope,mbxSig,mbxDate,mbxStored)
      VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE mbxStored = mbxStored`;

    con.query(SQL,values,(err)=>{
      if (err){
        console.log('sealed mail store failed:',err);
        this.net.endRes(remIp,JSON.stringify({mailStoreRes:false,mailStorHash:mail.hash,error:'db error'}));
        return;
      }
      this.net.endRes(remIp,JSON.stringify({mailStoreRes:true,mailStorHash:mail.hash}));
    });
  }
  /* Answers a retrieval broadcast when this cell holds mail for the MUID.
     The requester must have signed as the addressee, so a cell cannot fish
     for somebody else's mail. Silence when nothing is held. */
  doSendMyMail(j,remIp,onLocal){
    // Handled locally already; ignore this cell's own broadcast echoed back.
    if (!onLocal && j.origin && j.origin === this.net.rnet?.myIp) return;
    if (!this.isValidSig(j.sig)){
      console.log('mail request signature invalid... no mail sent');
      return;
    }
    if (j.sig.ownMUID !== j.MUID){
      console.log('mail request is not signed by the addressee... no mail sent');
      return;
    }
    let SQL = `select mbxHash,mbxEnvelope,mbxSig,mbxDate from mailTree.mailInBox where mbxToMUID = ?`;
    const values = [j.MUID];
    if (j.hash){
      SQL += ' and mbxHash = ?';
      values.push(j.hash);
    }
    SQL += ' order by mbxDate desc limit 500';

    con.query(SQL,values,(err,result)=>{
      if (err){console.log(err); return;}
      if (result.length === 0) return;

      const mail = [];
      for (const row of result){
        try {
          mail.push({
            hash     : row.mbxHash,
            envelope : JSON.parse(row.mbxEnvelope),
            sig      : row.mbxSig ? JSON.parse(row.mbxSig) : null,
            date     : row.mbxDate
          });
        }
        catch(err) {console.log('stored envelope is not valid JSON:',row.mbxHash);}
      }
      if (mail.length === 0) return;
      const reply = {req:'sendMyMailResult',reqId:j.reqId,result:true,mail:mail};
      if (onLocal) {onLocal(reply); return;}
      this.net.sendReply(remIp,reply);
    });
  }
  // Deletes held mail on the addressee's own signed request.
  doDeleteMyMail(j,remIp,onLocal){
    // Handled locally already; ignore this cell's own broadcast echoed back.
    if (!onLocal && j.origin && j.origin === this.net.rnet?.myIp) return;
    if (!this.isValidSig(j.sig) || j.sig.ownMUID !== j.MUID){
      console.log('mail delete signature invalid... nothing deleted');
      return;
    }
    let SQL = `delete from mailTree.mailInBox where mbxToMUID = ?`;
    const values = [j.MUID];
    if (j.hash){
      SQL += ' and mbxHash = ?';
      values.push(j.hash);
    }
    con.query(SQL,values,(err,result)=>{
      if (err){console.log(err); return;}
      const reply = {
        req      : 'deleteMyMailResult',
        reqId    : j.reqId,
        result   : true,
        nDeleted : result.affectedRows || 0
      };
      if (onLocal) {onLocal(reply); return;}
      this.net.sendReply(remIp,reply);
    });
  }
  storeMail(j,remIp){
    console.log('got request store mail',j.mail.signature);
    if (!this.isValidSig(j.mail.signature)){
      console.log('Mail Signature Invalid... NOT stored');
        this.net.endRes(remIp,'{"mailStoreRes":false,"error":"Invalid Signature For Request"');
        return;
    }
    var SQL = "select sownID from mailTree.mailOwners where sownMUID = '"+j.mail.from+"'";
    con.query(SQL , async(err, result,fields)=>{
      if (err){
        console.log(err);
        this.net.endRes(remIp,'{"mailStoreRes":false,"error":"'+err+'"');
        return;
      }
      else {
        var sownID = null;
	if (result.length == 0){
          sownID = await this.createNewSOWN(j.mail.from);
          if (!sownID){
            this.net.endRes(remIp,'{"mailStoreRes":false,"error":"failed to create new owner record for mailOwner"}');
            return null;
          }
	}
        else {
	  sownID = result[0].sownID;
	}
      }
      
      SQL = "SELECT count(*)nRec FROM `mailTree`.`mails` WHERE mailOwnerID = "+sownID+" and mailHash = '"+j.mail.hash+"'";
      con.query(SQL , async(err, result,fields)=>{
        if (err){
          console.log(err);
          this.net.endRes(remIp,'{"mailStoreRes":false,"error":"'+err+'"');
          return;
        }
        else {
          if (result[0].nRec > 0){
	    console.log("Mail Record exists");
            this.net.endRes(remIp,'{"mailStoreRes":false,"error":"Mail Record exists"');
            return;
	  }
        }
        fs.writeFile(ftreeRoot+sownID+'-'+j.mail.hash+'.srd', j.mail.data, (err)=> {
          if (err) {
            console.log('error writing srootTree:', err);
            this.net.endRes(remIp,'{"mailStoreRes":false,"error":"'+err+'"');
            //console.log('Wallet Created And Saved!');
	  }
	  else {
	    this.createInvoiceRec(sownID,j.mail.hash,j.mail.signature);
            this.net.endRes(remIp,'{"mailStoreRes":true,"mailStorHash":"' + j.mail.hash + '"}');
	  }
        });
      });
    });
  }
};	  
function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.mailTreeObj = mailTreeObj;
module.exports.mailTreeCellReceptor = mailTreeCellReceptor;
