/****************************
BitMonky Wallet Server
****************************
*/

const webCon  = require('http');
const fs      = require('fs');
const url     = require('url');
const multer  = require('multer');
const path    = require('path');
const EC      = require('elliptic').ec;
const ec      = new EC('secp256k1');
const bitcoin = require('bitcoinjs-lib');
const crypto  = require('crypto');
const ALGO    = "aes-256-cbc"
const port    = 80;
const wfile   = 'keys/myBMGPWallet.key';
const wconf   = 'keys/wallet.conf';

const { generateKeyPairSync } = require('crypto')
const upload = multer({dest:'uploads/'});
const sanitize = require('sanitize-filename');

const baseDir = path.join(__dirname, 'uploads');
const allowedExtensions = ['.jpg', '.png', '.txt'];

function sanitizeFilename(filename) {
  const safeFilename = sanitize(filename);

  /* Validate the file extension
  const ext = path.extname(safeFilename).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error('Invalid file extension');
  }*/
  return safeFilename;
}

function isSafePath(userPath) {
  const safePath = path.normalize(userPath);

  // Restrict to the base directory
  const resolvedPath = path.resolve(baseDir, safePath);
  if (!resolvedPath.startsWith(baseDir)) {
    console.log('Unauthorized file path');
    return false;
  }

  return resolvedPath;
}
const https = require('https');

class BorgPortal {
  constructor() {
    this.pfile = 'keys/borgPortalsList.dat';
    this.portals = [];
    this.loadPortals();
  }

  loadPortals() {
    try {
      const data = fs.readFileSync(this.pfile, 'utf8');
      this.portals = JSON.parse(data);
    } catch (error) {
      console.log("borgPortalsList Update.. file doesn't exist. Initializing empty portals list.");
      this.portals = [];
    }
  }
  testConnect(url) {
    return new Promise((resolve) => {
      const options = {
        method: 'HEAD',
        agent: new https.Agent({ rejectUnauthorized: false }) 
      };

      const req = https.request(url, options, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.end();
    });
  }

  async selectPortal(netName) {
    const index = this.portals.findIndex(portal => portal.netName === netName);
    console.log('INDEX',index,netName);
    if (index === -1) {
      return 'web.bitmonky.com';
    }     

    let activeNodes = [...this.portals[index].activeNodes]; // Copy active nodes

    while (activeNodes.length > 0) {
      // Randomly select an index
      const rnodeIndex = Math.floor(Math.random() * activeNodes.length);
      let result = `${activeNodes[rnodeIndex]}`;

      if (this.portals[index].recPort) {
        result += `:${this.portals[index].recPort}`;
      }

      const isConnected = await this.testConnect(result);
      if (isConnected) {
        console.log(`Successful HTTPS connection: ${result}`);
        return result;
      }

      console.log(`Failed HTTPS check: ${result}, removing and retrying...`);
      activeNodes.splice(rnodeIndex, 1); 
    }

    console.log("No available portals responded successfully.");
    return 'web.bitmonky.com';
  }
}
class mkyRSAMail {
  constructor(pPhrase,keys=null){
    this.passPhrase = pPhrase;
    if (keys){
      this.publicKey = keys.publicKey;
      this.privateKey = keys.privateKey;
    }
  } 
  encryptString(toEncrypt,toPubKey=null) {
    if (!toPubKey) toPubKey =  this.publicKey;
    var buffer = Buffer.from(toEncrypt);
    var encrypted = crypto.publicEncrypt(toPubKey, buffer);
    return encrypted.toString("base64");
  };

  decryptString(toDecrypt) {
    var buffer = Buffer.from(toDecrypt, "base64");
    const decrypted = crypto.privateDecrypt(
      {
        key: this.privateKey, 
        passphrase: this.passPhrase,
      },
      buffer,
    )
    return decrypted.toString("utf8");
  };
  generateKeys() {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', 
    {
      modulusLength: 4096,
      namedCurve: 'secp256k1', 
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'     
      },     
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: this.passPhrase
      } 
    });
    this.publicKey  = publicKey;
    this.privateKey = privateKey;
    return { publicKey : publicKey, privateKey}
  }
};

function urldecode(msg){
  msg = msg.replace(/\+/g,' ');
  msg = decodeURI(msg);
  msg = msg.replace(/%3A/g,':');
  msg = msg.replace(/%2C/g,',');
  msg = msg.replace(/%2F/g,'/');  
  msg = msg.replace(/\\%2F/g,'/');
  return msg;
}

class bitMonkyWSrv {
  constructor(){
    this.wallet = new bitMonkyWallet();
    this.init();
  }
  async init() {
    //console.log(this.wallet);
    this.allow = ["127.0.0.1"];
    this.recPort = 1385;
    this.readConfigFile();
    this.portal = new BorgPortal();
    this.webPortal = await this.portal.selectPortal('borgApache');
    console.log('USINGING WEB PORTAL',this.webPortal);
   
    this.srv = webCon.createServer( async (req, res) => {
     var pathname = url.parse(req.url).pathname;
     console.log(pathname);
     if (req.method === 'GET' && pathname === '/favicon.ico') {
       res.setHeader('Content-Type', 'image/x-icon');
       fs.createReadStream('favicon.ico').pipe(res);
       return;
     }
     
     if (req.method === 'POST' && pathname === '/storeRepoFileOnTree.php') {
       console.log('Got repoUploadFile.php req!');
       upload.single('photo')(req, res, (err) => {
         if (err) {
           res.writeHead(500, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ result: false, data: 'File Upload Failed' }));
           return;
         }

         const { originalname, mimetype, path: tmpname, size, error } = req.file;
         console.log(req.file);
         if (size > 0 && size < 200000000 && !error) {
           const contents = fs.readFileSync(tmpname);
           const hash = crypto.createHash('sha256').update(contents).digest('hex');
           const fholder = `${hash}.tmp`;
           const targetDir = 'uploads/';
           const targetFile = path.join(targetDir, fholder);

           fs.rename(tmpname, targetFile, (err) => {
             if (err) {
               res.writeHead(500, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ result: false, data: 'File Move Failed' }));
             } else {
               //res.writeHead(200, { 'Content-Type': 'application/json' });
               //res.end(JSON.stringify({ result: false, data: 'File Upload Failed' })); 
	       //return; 
               const j = {
                 req : 'uploadUserFile',
                 fileName : originalname,
                 filePath : targetFile,
                 mimeType : mimetype, 
                 remoteUrl : `${this.webPortal}/whzon/bitMiner/storeRepoFileOnTree.php`
               }
               this.wallet.doUploadFile(j, res);
             } 
           });
         }
	 else {
           res.writeHead(400, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ result: false, data: 'Invalid File' }));
         }
       });
     }
     else {
       if (req.url.indexOf('/netREQ/msg=') == 0){
          res.writeHead(200);
          var msg = req.url.replace('/netREQ/msg=','');
          msg = urldecode(msg);
          this.handleRequest(msg,res);
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
                handleRequest(body,res);
              });
            }	
          }
          else { 
            res.setHeader("Set-Cookie", "SameSite=None; Secure");
            res.setHeader("Content-Type", "text/html");
            res.writeHead(200);
            const indexFile = 'html/index.html';
            const readStream = fs.createReadStream(indexFile, 'utf8');

            let fileContent = '';

            readStream.on('data', (chunk) => {
              fileContent += chunk;
            });

            readStream.on('end', () => {
              fileContent = fileContent.replace(/<BORG_PORTAL>/g, this.webPortal); 
              res.end(fileContent);
            });

            readStream.on('error', (err) => {
              console.error("Error reading file:", err);
              res.end("Error loading index file."+indexFile);
            });
            return;
          }
        }
      }
    });
    this.srv.on('connection', (sock)=> {
      console.log(sock.remoteAddress,this.allow);
      if (this.allow.indexOf(sock.remoteAddress) < 0){
        sock.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      } 
    });

    this.srv.listen(port,'localhost');
    console.log('bitMonky Wallet Server running at http://localhost:'+port);
  }
  handleRequest(msg,res){
     var j = null;
          
     try {
       j = JSON.parse(msg);
       console.log(j);
       if (j.PIN != 'TEST_PIN_2x49fg16'){ //this.wallet.walletCipher){
         j.req    = 'repPINFail';
         j.result = true;
         j.msg    = "PIN Error";
         res.end(JSON.stringify(j));
         return; 
       }   
       if (j.req){
         if (j.req == 'useNewWallet'){
           this.wallet.changeWallet(j,res);
           return;
         }
         //if (j.req == 'uploadUserFile'){
         //  this.wallet.doUploadFile(j, res);
         //  return;
         //}
         if (j.req  == 'signToken'){
           j.signedToken = this.wallet.signMsg(j.sigTokenData);
           res.end(JSON.stringify(j));
           return;
         }
         if (j.req  == 'getRsaPubKey'){
            j.rsaPubKey = this.wallet.rsaKeys
            res.end(JSON.stringify(j));
            return;
         }
         if (j.req  == 'rsaDecodeMsg'){
            this.Wallet.doRsaDecodeMsg(j,res);
            return;
         }
         this.wallet.doMakeReq(j.req,res,j.parms,j.service);
         return;
       } 
       res.end("No Handler Found For:\n\n "+JSON.stringify(j));
     }
     catch(err) {
       //console.log("json parse error:",err);
       res.end("JSON PARSE Errors: \n\n"+msg+"\n\n"+err);
     }
  }
  readConfigFile(){
     var conf = null;
     try {conf =  fs.readFileSync(wconf);}
     catch {console.log('no config file found');}
     if (conf){
       try {
         conf = conf.toString();
         const j = JSON.parse(conf);
         this.recPort       = j.receptor.port;
         this.allow         = j.receptor.allow;
       }
       catch(err) {
         console.log('conf file not valid', err);
         this.recPort = 1385;
         this.allow = ["127.0.0.1"];
       }
     }
  }
};

class bitMonkyWallet{
   constructor(){
      this.publicKey   = null;
      this.privateKey  = null;
      this.signingKey  = null;
      this.rsaKeys     = null;
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
   changeWallet(j,res){
     console.log('changeWallet',j.wallet.ownMUID); 
     if (j.wallet.ownMUID == 'useDefault'){
        this.openWallet();
        j.result = true;
        console.log('result',JSON.stringify(j));
        res.end(JSON.stringify(j));
        return;
      }
      
      this.publicKey     = j.wallet.publicKey;
      this.privateKey    = j.wallet.privateKey;
      this.ownMUID       = j.wallet.ownMUID;
      this.walletCipher  = j.wallet.walletCipher;
      this.signingKey    = ec.keyFromPrivate(this.privateKey);
      j.result = true;
      res.end(JSON.stringify(j));
   }
   openWallet(){
      var keypair = null;
      try {keypair =  fs.readFileSync(wfile);}
      catch {console.log('no wallet file found');}
      this.publicKey = null;
      if (keypair){
        try {
          const pair = keypair.toString();
          const j = JSON.parse(pair);
          this.publicKey     = j.publicKey;
          this.privateKey    = j.privateKey;
          this.ownMUID       = j.ownMUID;
          this.walletCipher  = j.walletCipher;
          if (j.rsaKeys)
            this.rsaKeys       = j.rsaKeys;
          else {
            const rsaMail = new mkyRSAMail(this.walletCipher);
            this.rsaKeys = rsaMail.generateKeys();
            this.writeWallet();
          }  
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
        this.ownMUID = mkybc.address;

        const pmc = ec.genKeyPair();
        this.pmCipherKey  = pmc.getPublic('hex');

        console.log('Generate a new wallet cipher key');
        mkybc = bitcoin.payments.p2pkh({ pubkey: new Buffer.from(''+this.pmCipherKey, 'hex') });
        this.walletCipher = mkybc.address;

        const rsaMail = new mkyRSAMail(this.walletCipher);
        this.rsaKeys = rsaMail.generateKeys();
        this.writeWallet();
      }
   }
   doUploadFile(j, res) {
     console.log('doUploadFile::',j);
     const https = require('https');
     const FormData = require('form-data');
     //const mime = require('mime-types');

     const filePath = j.filePath;  
     const remoteUrl = j.targetURL;

     const form = new FormData();
     form.append('photo', fs.createReadStream(filePath), {
        filename: j.fileName, 
        contentType: j.mimeType
     });

     const options = {
        hostname : 'www.bitmonky.com',
        port     : 443,
        path     : '/whzon/bitMiner/storeRepoFileOnTree.php',
        method: 'POST',
        headers: form.getHeaders(),
     };

     const req = https.request(options, serverRes => {
        console.log(options);
        let responseData = '';

        serverRes.on('data', (chunk) => {
            responseData += chunk;
        });

        serverRes.on('end', () => {
            try {
                console.log('ResponseData is::',responseData);
                const response = JSON.parse(responseData);
                if (response.result) {
                    console.log('Upload successful:', response);
                    j.result = true;
                    j.msg = 'File uploaded successfully.';
                    j.response = response;
                } else {
                    console.log('Upload failed:', response);
                    j.result = false;
                    j.msg = `Error on file upload: ${response.message}`;
                }
            } catch (error) {
                console.log('Failed to parse server response:',responseData, error);
                j.result = false;
                j.msg = `Error on file upload: ${responseData}`;
            }
            res.end(JSON.stringify(j));
        });
    });

    req.on('error', (error) => {
        console.log('Request error:', error);
        j.result = false;
        j.data = `Error on file upload: ${error.message}`;
        res.end(JSON.stringify(j));
    });

    form.pipe(req);
  }
  writeWallet(){
     var wallet = '{"ownMUID":"'+ this.ownMUID+'","publicKey":"' + this.publicKey + '","privateKey":"' + this.privateKey + '",';
     wallet += '"walletCipher":"'+this.walletCipher+'","rsaKeys":'+JSON.stringify(this.rsaKeys)+'}';
     console.log(wallet);

     fs.writeFileSync(wfile, wallet);
   }
   getRsaMailObj(){
     if (!this.rsaMail){
       this.rsaMail = rsaMail = new mkyRSAMail(this.walletCipher,this.rsaKeys);
     }
   }
   doRsaDecodeMsg(j,res){
     this.getRsaMailObj();
     msgTok = this.rsaMail.decryptString(j.parms.msg.rsaToken);
     msgIV  = this.rsaMail.decryptString(j.parms.msg.rsaIV);
     j.msgClear = deCypher(j.parms.msg.body,msgTok);
     res.end(JSON.stringify(j));
   }
   doRsaEncodeMsg(j,res){
     this.getRsaMailObj();
     const randTok = crypto.randomBytes(32).toString('base64');
     const ranIV   = crypto.randomBytes(16).toString('base64');
     j.msgEncoded  = enCrypt(j.parms.msg.body,randToken);
     j.msgRsaToken = this.rsaMail.encryptString(randTok,j.parms.msg.toPubKey);
     j.msgRsaIV    = this.rsaMail.encryptString(randIV,j.parms.msg.toPubKey);
     res.end(JSON.stringify(j));
   }
   enCrypt(msg,msgToken,msgIV){
     let cipher = crypto.createCipheriv(ALGO, msgToken, msgIV);
     let encrypted = cipher.update(msg, 'utf8', 'base64');
     encrypted += cipher.final('base64');
     return encrypted;
   }
   deCypher(msg,msgKey,msgIV){
     let decipher = crypto.createDecipheriv(ALGO, msgKey, msgIv);
     let decrypted = decipher.update(text, 'base64', 'utf8');
     return (decrypted + decipher.final('utf8'));
   }
   signMsg(stok) {
     const sig = this.signingKey.sign(this.calculateHash(stok), 'base64');
     const hexSig = sig.toDER('hex');
     return hexSig;
   }
   doMakeReq(action,res,parms,service){
     const stok = this.ownMUID+Date.now(); 	   
     var msg = {
       Address : this.ownMUID,
       sesTok  : stok,
       pubKey  : this.publicKey,
       sesSig  : this.signMsg(stok),
       action  : action,
       parms   : parms
     }
     this.sendPostRequest(msg,res,service);
   }

   handleResponse(data,res){
     data.pMUID = this.ownMUID;
     console.log('API-Response:\n\n',data);
     if (data.callBack){
       this.handleCallBack(data,res);
     }
     else if (res){
       res.end(JSON.stringify(data));
     }
   }
   handleCallBack(j,wres){
      if(j.action == 'cbkSignToken'){
        j.orig.parms.tokenSig = this.signMsg(j.token);
        console.log('callback is now:',j.orig);
        this.sendPostRequest(j.orig,wres);
      }          
   }
   sendPostRequest(msg,wres=null,service=null,redirectCount=0){
      const MAX_REDIRECTS = 5; // Limit the number of redirects

      if (redirectCount > 0 ) {
        console.log('REDIRECT::',redirectCount,service);
      }
      if (redirectCount > MAX_REDIRECTS) {
        console.log("Maximum redirects reached. Aborting request.");
        return;
      }


      if (service === null){
        service = {
          endPoint : '/whzon/gold/netWalletAPI.php',
          host     : 'web.bitmonky.com',
          port     : ''
        }
      }
      console.log('ServiceInfo:/n/n',service);
      const https = require('https');

      const data = JSON.stringify(msg);
      const agent = new https.Agent({
        rejectUnauthorized: false 
      });

      const options = {
        hostname : urldecode(service.host),
        port     : urldecode(service.port),
        path     : urldecode(service.endPoint),
        method   :'POST',
        agent    : agent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        } 
      }
      const req = https.request(options, res => {
        var body = '';

        res.on('data', (chunk)=>{
          body = body + chunk;
        });

        res.on('end',()=>{
          if (res.statusCode === 302) {
            const redirectUrl = res.headers.location;
            if (redirectUrl) {
              const parsedUrl = new URL(redirectUrl);
              const newService = {
                endPoint: parsedUrl.pathname + parsedUrl.search, 
                host: parsedUrl.hostname,
                port: parsedUrl.port || '' 
              };

              console.log(`Redirecting to: ${redirectUrl}`);
              this.sendPostRequest(msg, wres, newService, redirectCount + 1);
            } else {
              console.log('Redirect response received, but no location header provided.');
            }
          }
          else if (res.statusCode != 200) {
            console.log("Api call failed with response code " + res.statusCode);
          } 
	  else {
            console.log('API Response:->',body);
            try {
              this.handleResponse(JSON.parse(body),wres);
            }
            catch(err) {console.log(err);}
          }
        });
      });
      req.on('error', error => {
         console.log(error);
      });

      req.write(data);
      req.end();
   } 
};

const myWallet = new bitMonkyWSrv();

module.exports.bitMonkyWSrv = bitMonkyWSrv;

