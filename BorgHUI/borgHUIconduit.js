/**
 * borgHUIconduit.js
 *
 * borgHUI uses a BORG‑native mnemonic that deterministically encodes
 * the EC private key. The seed phrase restores the exact same keypair,
 * public key, and address — it is not a BIP‑39 wallet and does not
 * derive multiple keys.
 *
 * This is NOT a crypto wallet. The EC keypair represents user identity
 * and data ownership within the BorgIOS network.
 */

const EventEmitter = require('events');
const webCon  = require('http');
const fs      = require('fs');
const url     = require('url');
const multer  = require('multer');
const path    = require('path');
const EC      = require('elliptic').ec;
const ec      = new EC('secp256k1');
const bitcoin = require('bitcoinjs-lib');
const crypto  = require('crypto');
const mime    = require('mime-types');
const sodium  = require('libsodium-wrappers');
const ALGO    = "aes-256-cbc"
const port    = 80;
const wfile   = 'keys/myBMGPWallet.key';
const wconf   = 'keys/wallet.conf';

const {BorgHUIstreamMgr} = require('./BorgHUIstreamMgr.js');
const {BorgHUIptreeAPI}  = require("./borgHUIptreeAPI.js");
const {BorgHUIFileMgrUI} = require("./borgHUIFileMgrUI.js");
const {BorgHUIBorgPay}   = require("./borgHUIBorgPay.js");

const maxUpLoadSize = 100000000000; // 1Gig

const { generateKeyPairSync } = require('crypto')
const upload = multer({dest:'uploads/'});
const sanitize = require('sanitize-filename');

const baseDir = path.join(__dirname, 'uploads');
const allowedExtensions = ['.jpg', '.png', '.txt'];

function deriveFileKey(masterKey) {
  return crypto.hkdfSync(
    'sha256',
    Buffer.from(masterKey, 'hex'),
    Buffer.alloc(0),                 // no salt
    Buffer.from("borg-file-key"),    // info
    32
  );
}
function sanitizeFilename(filename) {
  const safeFilename = sanitize(filename);

  /* Validate the file extension
  const ext = path.extname(safeFilename).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error('Invalid file extension');
  }*/
  return safeFilename;
}
function isImageMime(mime) {
  return typeof mime === "string" && mime.startsWith("image/");
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
/*
********************
Override Date class so that all nodes use one unifide time dictated By the root node.
Capture the real Date constructor and real Date.now
********************
*/

const RealDate = Date;
const realNow = RealDate.now;

let peerTCorrection = 0;

// Override the Date constructor
function CorrectedDate(...args) {
  if (args.length === 0) {
    return new RealDate(realNow() + peerTCorrection);
  }
  return new RealDate(...args);
}

// Copy static methods
CorrectedDate.now = () => realNow() + peerTCorrection;
CorrectedDate.UTC = RealDate.UTC;
CorrectedDate.parse = RealDate.parse;

// Preserve prototype so instanceof still works
CorrectedDate.prototype = RealDate.prototype;

// Install the override
Date = CorrectedDate;//console.error('running::',process.title);

function parseChronyOffset(output) {
  // Find the line containing "Last offset"
  const match = output.match(/Last offset\s*:\s*([+-]?\d+\.?\d*)\s*seconds/i);
  if (!match) {
    throw new Error("Could not parse chronyc tracking output");
  }

  const seconds = parseFloat(match[1]);
  const milliseconds = Math.round(seconds * 1000);

  return milliseconds;
}


/*
 ::End Time Overide code
*/
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
     url = `https://${url}`;
     console.log('trying url',url);
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
  getPortalsAll(netName){
    console.log(`getPortalsAll():: service name `,netName);
    const index = this.portals.findIndex(portal => portal.netName === netName);
    console.log(`applyCronoTreeTime():: index is `,index);
    if (index === -1) {
      return null;
    }

    return {port: this.portals[index].recpPort, nodes:[...this.portals[index].activeNodes]};
  }
  async selectPortal(netName) {
    //console.log(`selectPortal():: `,this.portals);
    const index = this.portals.findIndex(portal => portal.netName === netName);
    console.log('INDEX', index, netName);

    if (index === -1) {
      return { host: 'localhost', port: 80 };
    }

    let activeNodes = [...this.portals[index].activeNodes]; // Copy active nodes

    while (activeNodes.length > 0) {
      // Randomly select an index
      const rnodeIndex = Math.floor(Math.random() * activeNodes.length);
      const node = activeNodes[rnodeIndex];

      const host = node.ip;
      const port = this.portals[index].recpPort || 443;

      const target = `${host}:${port}`;

      const isConnected = await this.testConnect(target);

      if (isConnected) {
        console.log(`Successful HTTPS connection: ${target}`);
        return { host, port };
      }

      console.log(`Failed HTTPS check: ${target}, removing and retrying...`);
      activeNodes.splice(rnodeIndex, 1);
    }

    // If no nodes worked, fall back
    return { host: 'web.bitmonky.com', port: 443 };
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

function urldecode(msg) {
  // If it's not a string, return it unchanged
  if (typeof msg !== 'string') {
    return msg;
  }

  msg = msg.replace(/\+/g, ' ');
  msg = decodeURI(msg);
  msg = msg.replace(/%3A/gi, ':');
  msg = msg.replace(/%2C/gi, ',');
  msg = msg.replace(/%2F/gi, '/');
  msg = msg.replace(/\\%2F/gi, '/');

  return msg;
}

class bitMonkyWSrv extends  EventEmitter {
  constructor(){
    super();
    this.portal     = new BorgPortal();
    this.DStream    = new BorgHUIstreamMgr(this);
    this.sseClients = [];
    this.portal     = new BorgPortal();
    this.PTree      = new BorgHUIptreeAPI(this);
    this.UI         = new BorgHUIFileMgrUI(this);
    this.BPay       = new BorgHUIBorgPay(this);
    this.wallet     = new bitMonkyWallet(this);
    this.wcj        = null; // wallet conf json data; 
    this.borgMasterID = this.getBorgMasterID();
    this.clockPulse = 60*1000;
    this.init();
    //setInterval(() => { this.pushEvent('borg-event',{hello:"hello"});console.log(`borg-event`);},8000);
  }
  async init() {
    //console.log(this.wallet);
    this.allow = ["127.0.0.1"];
    this.recPort = 1385;
 
    const wp  = await this.portal.selectPortal('borgApacheCell');
    this.webPortal = `${wp.host}:${wp.port}`;

    await this.applyCronoTreeTime();

    this.readConfigFile();
    if (!this.wcj.openBal)   this.wallet.doCreateOpeningBalance();
    if (!this.wcj.userRoot)  this.wallet.doCreateNewUserRootRepo();
    if (!this.wcj.borgReg)   this.wallet.doUpdateBorgRegistry();

    console.log('USINGING WEB PORTAL',this.webPortal);
   
    this.srv = webCon.createServer( async (req, res) => {
     var pathname = url.parse(req.url).pathname;
     
     if (req.method === 'GET' && pathname === '/favicon.ico') {
       res.setHeader('Content-Type', 'image/x-icon');
       fs.createReadStream('favicon.ico').pipe(res);
       return;
     }
     
       if (req.url === "/borgEvents") {
         return this.handleSSE(req, res);
       }
       else if (req.method === 'POST' && req.url.indexOf('/storeRepoFileOnTree') === 0) {
         console.log('Got repoUploadFile !',req.url);
 

         const urlObj = new URL(req.url, `http://${req.headers.host}`);

         const meta = {
           ownerMUID : urlObj.searchParams.get('ownerMUID'),
           path      : urlObj.searchParams.get('path'),
           folderID  : urlObj.searchParams.get('folderID'),
           rname     : urlObj.searchParams.get('rname'),
           encrypt   : urlObj.searchParams.get('encrypt') 
         } 
         console.log(`upload meta data`,meta);

         upload.single('photo')(req, res, (err) => {
           if (err) {
             res.writeHead(500, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ result: false, data: 'File Upload Failed' }));
             return;
           }

           const { originalname, mimetype, path: tmpname, size, error } = req.file;
           console.log(req.file);
           meta.filename = originalname;

           if (size > 0 && size < maxUpLoadSize && !error) {

             // --- STREAMING HASH FUNCTION ---
             const hashFileStream = (filePath) => {
               return new Promise((resolve, reject) => {
                 const hash = crypto.createHash('sha256');
                 const stream = fs.createReadStream(filePath);

                 stream.on('data', chunk => hash.update(chunk));
                 stream.on('end', () => resolve(hash.digest('hex')));
                 stream.on('error', reject);
               });
             };

             // --- USE STREAMING HASH ---
             hashFileStream(tmpname)
             .then(hash => {
               const fholder = `${hash}.tmp`;
               const targetDir = 'uploads/';
               const targetFile = path.join(targetDir, fholder);

               fs.rename(tmpname, targetFile, (err) => {
                 if (err) {
                   res.writeHead(500, { 'Content-Type': 'application/json' });
                   res.end(JSON.stringify({ result: false, data: 'File Move Failed' }));
                 } else {
                   const j = {
                     req: 'uploadUserFile',
                     fileName : originalname,
                     filePath : targetFile,
                     mimeType : mimetype,
                     repoInfo : meta
                   };
                   this.wallet.doUploadFile(j, res);
                 }
               });
             })
             .catch(err => {
               console.error('Hashing failed:', err);
               res.writeHead(500, { 'Content-Type': 'application/json' });
               res.end(JSON.stringify({ result: false, data: 'Hashing Failed' }));
             });
           }
           else {
             console.error('File Upload Max Size Exceeded: size is:', size);
             res.writeHead(500, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify({ result: false, data: 'Max Upload Size Exceeded' }));
           } 
         });
     }
     else {

       if (req.url.indexOf('/netREQ/msg=') == 0){
          var msg = req.url.replace('/netREQ/msg=','');
          msg = urldecode(msg);
          this.handleRequest(msg,res,req);
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
                handleRequest(body,res,req);
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
  async getBorgMasterID(){
    return '1B1xrS6Xi6uhCoXcH8UzSETk81S2pmpWjQ';
  }
  handleSSE(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    res.write("\n");

    this.sseClients.push(res);

    req.on("close", () => {
      const i = this.sseClients.indexOf(res);
      if (i !== -1) this.sseClients.splice(i, 1);
    });
  }
  pushEvent(eventName, data) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    this.sseClients.forEach( (c) =>{
      c.write(payload);
      console.log(payload);
    });
  }
  async applyCronoTreeTime() {
    console.log(`applyCronoTreeTime():: checking BorgTime`);
    try {
      const ps = this.portal.getPortalsAll('cronoTreeCell');
      const portals = ps.nodes;

      if (!portals || portals.length === 0) {
        setTimeout(() => this.applyCronoTreeTime(), this.clockPulse);
        return;
      }

      // Fire all requests in parallel
      const promises = portals.map(p =>
        this.requestCronoTime(p.ip, ps.port)
          .then(j => j?.cronoTreeSystemClock?.rootTime)
          .catch(() => null)
      );

      const results = await Promise.all(promises);

      const times = results.filter(rt =>
        rt !== null &&
        rt !== 'unavailable' &&
        typeof rt === 'number'
      );

      // Debug
      for (let i = 0; i < portals.length; i++) {
        console.log(`applyCronoTreeTime():: ${portals[i].ip} says`, results[i]);
      }
      console.log(`Times:: `,times);

      if (times.length > 0) {
        // Sort
        times.sort((a, b) => a - b);

        // Median
        const median = times[Math.floor(times.length / 2)];

        // Filter out extreme offsets
        const filtered = times.filter(t => Math.abs(t - median) < 200);

        // Average the remaining cluster
        const avg = filtered.reduce((a, b) => a + b, 0) / filtered.length;

        // Apply drift correction
        peerTCorrection = avg - realNow();
        console.log(`applyCronoTreeTime():: avg ${avg} peerTCorrection `, peerTCorrection, Date.now(), realNow());
      }

    } catch (_) {}

    setTimeout(() => this.applyCronoTreeTime(), this.clockPulse);
  }
  async requestCronoTime(ip,port) {
     const msg = {msg:{req:'sendCronoTime'}};
     const body = JSON.stringify(msg);

     const options = {
       hostname: ip,
       port: port,
       path: '/netReq',
       method: 'POST',
       rejectUnauthorized: false,   // allow self‑signed cert
       headers: {
         'Connection': 'close',
         'Content-Type': 'application/json',
         'Content-Length': Buffer.byteLength(body, 'utf8')
       },
       timeout: 3500   // 1.5s timeout — adjust as needed
     };
     return new Promise((resolve, reject) => {
       const req = https.request(options, (res) => {
         let data = '';

         res.on('data', chunk => data += chunk);
         res.on('end', () => {
           try {
             resolve(JSON.parse(data));
           } catch (err) {
             reject(new Error(`Invalid JSON response: ${data}`));
           }
         });
       });

       req.on('timeout', () => {
         req.destroy();
         reject(new Error('Request timed out'));
       });

       req.on('error', reject);

       req.write(body);
       req.end();
     });
   }
   async handleRequest(msg,res,req){
     var j = null;
          
     try {
       j = JSON.parse(msg);
       //console.log(`handleRequest():: values:`,msg);
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
         if (j.req  == 'sendRSV'){
            this.wallet.doRSVExecuteCmd(j,res);
            return;
         }
         if (j.req  == 'getRsaPubKey'){
            j.rsaPubKey = this.wallet.rsaKeys
            res.end(JSON.stringify(j));
            return;
         }
         if (j.req  == 'rsaDecodeMsg'){
            this.wallet.doRsaDecodeMsg(j,res);
            return;
         }
         if (j.req  == 'startBorgBrowser'){
            this.startBorgBrowser(res);
            return;
         }  
         if (j.req === 'updateMyIcon'){
           await this.wallet.doUpdateMyIcon(j,res);
           return;
         }
         if (j.req === 'createAccount'){
           await this.wallet.doCreateAccount(j,res);
           return;
         }
         if (j.req === 'sendWalletOptions'){
           await this.wallet.doSendWalletOptions(j,res);
           return;
         }
         if (j.req === 'sendAccountInfo'){
           await this.wallet.doSendAccountInfo(j,res);
           return;
         }
         if (j.req === 'sendBorgTime'){
           await this.wallet.doSendBorgTime(j,res);
           return;
         }
         if (j.req === 'sendBorgFileSys' || j.req === 'borgUpdateResByUrl'){
           await this.wallet.doHandleBorgFileSys(j,res);
           return;
         }

         if (j.req  === 'getFileFromRepo'){
            this.getFileFromRepo(req,j, res);
            return;
         }
         this.wallet.doMakeReq(j.req,res,j.parms,j.service);
         return;
       } 
       res.end("No Handler Found For:\n\n "+JSON.stringify(j));
     }
     catch(err) {
       console.log("json parse error:",err);
       console.log(`handleRequest():: values:`,msg);
       res.end("JSON PARSE Errors: \n\n"+msg+"\n\n"+err);
     }
  }
async doCheckSumLookup(msg, service,checksum) {
  try {
    // Build new service object without shadowing the argument
    const lookupService = {
      endPoint: service.endPoint + (service.endPoint.includes("?") ? "&" : "?") + "checksumOnly=true&checksum=" + checksum,
      host: service.host,
      port: service.port,
      raw: true
    };

    console.log("doCheckSumLookup():: lookupService =", lookupService);

    // Perform checksum-only request
    let j = await this.wallet.sendPostRequest(msg, null, lookupService);
    return JSON.parse(j);
  }
  catch (err) {
    console.log("doCheckSumLookup():: failed:", msg, service, err);
    return null;
  }
}
async getFileFromRepo(req, msg, res) {
  const rawUrl = msg.url;
  const ftype  = msg.ftype;

  // Node requires a base for relative URLs
  console.log(`rawUrl`,rawUrl);
  const u = new URL(rawUrl, 'http://localhost');
  console.log(`u`,u);
  // Path
  const path = u.pathname;

  // Query fields
  const wzID      = u.searchParams.get('wzID');
  const fname     = u.searchParams.get('fname');
  const rname     = u.searchParams.get('rname');
  const repoPath  = u.searchParams.get('path');
  const ownerMUID = u.searchParams.get('ownerMUID');
  const folderID  = u.searchParams.get('folderID');
  const encrypt   = u.searchParams.get('encrypt');

  console.log('getFileFromRepo():: msg: ',  msg);
  let doTry = await this.PTree.ftreeGetFileFromRepo(ownerMUID, rname, fname, repoPath, folderID);
  console.log(`doTry`,doTry);
  if (doTry.status === 200){ 
    console.log(`getFileFromRepo():: doTry is `,doTry.json);
    //console.log(`getFileFromRepo():: doTry is `,doTry.json.file.shards);
    //console.log(`getFileFromRepo():: doTry is `,doTry.json.file.fileInfo);     
  }
  if (doTry?.json?.result === false){
    console.log(`doTry error: `,doTry.error);
    res.end(`Get File Failed... details: ${JSON.stringify(doTry)}\n`);
    return;
  }  
  if (doTry?.json?.file.fileInfo.fileSize > 0) {
    const p = await this.portal.selectPortal('shardTreeCell');

    const service = {
      endPoint : '/netREQ/',
      filename : `./downloads/${doTry.json.file.fileInfo.checkSum}.tmp`,
      host     : p.host,
      port     : p.port,
      raw      : true
    };

    doTry = await this.DStream.streamRepoFileFrom(service,doTry.json,res);
    //console.log('getFileFromRepo():: ',doTry);
    return;
  }

  try {
    const wp = await this.portal.selectPortal('borgApacheCell');

    const service = {
      endPoint: msg.url,
      host: wp.host,
      port: wp.port,
      raw: true
    };

    console.log('getFileFromRepo():: ', service, msg);

    // -----------------------------------
    // MIME TYPE DETECTION
    //-------------------------------------
    let mimeType = msg.mime;

    var fileName = null;
    if (!mimeType) {
      const parsed = url.parse(msg.url, true);
      fileName = parsed.query.fname;
      mimeType = mime.lookup(fileName) || "application/octet-stream";
    }
    console.log(`getFileFromRepo():: mimeType is;`,mimeType);
    // Do Checksum Check To See If File has changed
    // -----------------------------------
    // CHECKSUM LOOKUP
    // -----------------------------------
    const clientETag = req.headers['if-none-match'];
    const cleanETag = clientETag ? clientETag.replace(/"/g, "") : null;


    let remCheckSumOK = await this.doCheckSumLookup(msg,service,cleanETag);

    // Hard failure: network error, invalid JSON, PHP crash
    if (!remCheckSumOK) {
      console.log(`getFileFromRepo():: remCheckSumLookup failed`, remCheckSumOK);
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end(`Checksum Lookup Failed\n`);
    }

    // Soft failure: checksum mismatch (file changed)
    if (remCheckSumOK.result === false) {
      console.log(`getFileFromRepo():: checksum mismatch, fetching new file`, remCheckSumOK);
      // DO NOT RETURN — continue to fetch file
    }
    
    // -----------------------------------
    // BROWSER CACHE VALIDATION (ETag)
    //-------------------------------------

    if (cleanETag  && cleanETag === remCheckSumOK.checkSum) {
      // Browser already has this exact version
      res.writeHead(304);
      return res.end();
    }

    // Cache Not Useable Fetch file bytes from repo
    const result = await this.wallet.sendPostRequest(msg, null, service);
   
    if (result === null) {
      console.log(`getFileFromRepo():: failed `);
      if (isImageMime(mimeType)){
        res.writeHead(500, { "Content-Type": mimeType });
        res.end('');
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("Get File Failed... No File Found At url.\n");
    }
    // Try to parse JSON only if result is text-like
    let j = null;
    try {
      const text = Buffer.isBuffer(result) ? result.toString() : result;
      j = JSON.parse(text);
    } 
    catch (e) {
      // Not JSON — expected for binary files
    }

    if (j && j.result === false) {
      console.log(`getFileFromRepo():: failed on: `, j);

      if (isImageMime(mimeType)) {
        res.writeHead(500, { "Content-Type": mimeType });
        res.end('');
        return;
      }

      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end(`Get File Failed... details: ${JSON.stringify(j)}\n`);
    }
    
    console.log("CLIENT FIRST 20 BYTES:", new Uint8Array(result).slice(0, 20));
    console.log("CLIENT LAST 20 BYTES:", new Uint8Array(result).slice(-20));
    console.log("getFileFromRepo():: First 20 bytes:", result.slice(0, 20));
    console.log("LAST 20 BYTES:", result.slice(result.length - 20));


    // -----------------------------------
    // FILE INFO
    //-------------------------------------
    const fcheckSum = msg.checkSum || msg.fcheckSum || null;
    const fname     = fileName || null;
    const fileSize  = Buffer.isBuffer(result)
      ? result.length
      : Buffer.byteLength(result);

    console.log(`getFileFromRepo():: FILE INFO:`,fcheckSum,fname,fileSize);
    // -----------------------------------
    // BUILD RESPONSE HEADERS
    //-------------------------------------
    const headers = {
      "Content-Type": mimeType,
      "Content-Length": fileSize,
      "Accept-Ranges": "bytes"
    };

    if (fcheckSum) {
      headers["ETag"] = `"${fcheckSum}"`;
    }

    if (fname) {
      headers["Content-Disposition"] = `inline; filename="${fname}"`;
    }
    
    //console.log(`getFileFromRepo():: Headers:`,headers);

    // -----------------------------------
    // SEND FILE
    //-------------------------------------
    res.writeHead(200, headers);

    if (Buffer.isBuffer(result)) {
      console.log(`getFileFromRepo():: response is buffer:`);
      res.end(result);
    } else {
      console.log(`getFileFromRepo():: response is NOT buffer: converting`);
      res.end(Buffer.from(result));
    }

  } catch (err) {
    console.log("getFileFromRepo error:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Error Loading Borg Browser");
  }
}
  async startBorgBrowser(res, msg) {
    try {

      let jsCode = fs.readFileSync('./borgHUIboot.js', 'utf8');

      // Inject server-side values into the JS code
      jsCode =
        `// Injected by BorgHUI\n` +
        `var MODE        = "PC";        // or "Mobile"\n` +
        `var ROOT_DOMAIN = "localhost";\n` +
        `var SERVICE_HOST = "localhost";\n` +
        `var NET_PORT     = "" //80;\n` +
        `var PIN          = "TEST_PIN_2x49fg16";\n` +
        `\n` + jsCode; 

      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(jsCode);
/*
      const wp = await this.portal.selectPortal('borgApacheCell');

      const service = {
        endPoint : '/bitMDis/pWalletJSMPC.php?dbug=on&sport=80&dm=PC',
        host     : wp.host,
        port     : wp.port,
        raw      : true
      };

      const stok    = `${this.wallet.ownMUID}${reqTime}`    \\ old session token.

      var msg = {
        Address : this.wallet.ownMUID,
        sesTok  : stok,
        pubKey  : this.wallet.publicKey,
        sesSig  : this.wallet.signMsg(stok),
        action  : 'na',
        parms   : null
      }

      const result = await this.wallet.sendPostRequest(msg, null, service);

      if (result && result !== '') {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(result);
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("No Code For Borg Humane Interface Found.\n");
      }
*/
    }
    catch (err) {
      console.log("startBorgBrowser error:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Error Loading Borg Browser");
    }
  }
  readConfigFile(){
     var conf = null;
     try {conf =  fs.readFileSync(wconf);}
     catch {console.log('no config file found');}
     if (conf){
       try {
         conf     = conf.toString();
         const j  = JSON.parse(conf);
         this.wcj = j;

         this.recPort       = j.receptor.port;
         this.allow         = j.receptor.allow;
         this.nicName       = j.nicName;
         this.icon          = j.icon || null;
         this.openBal       = j.openBal || false;
         console.log(`readConfigFile():: this.wcj`, this.wcj);
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
   constructor(net){
      this.net = net;
      this.publicKey   = null;
      this.privateKey  = null;
      this.signingKey  = null;
      this.rsaKeys     = null;
      this.newWallet   = null;
      this.openWallet();
            
   }
   calculateHash(txt) {
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(txt).digest('hex');
   }
   signToken(token) {
      const sig = this.signingKey.sign(this.calculateHash(token), 'base64');
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
        const key       = ec.genKeyPair();
        this.publicKey  = key.getPublic('hex');
        this.privateKey = key.getPrivate('hex');

        this.signingKey = ec.keyFromPrivate(this.privateKey);

        console.log('Generate a new wallet key pair and convert them to hex-strings');

        let mkybc = bitcoin.payments.p2pkh({ pubkey: Buffer.from(this.publicKey, 'hex')});
        this.ownMUID = mkybc.address;

        // Derive cipher key deterministically from private key
        const cipherSeed = this.calculateHash(this.privateKey); // 32-byte hash
        const pmc = ec.keyFromPrivate(cipherSeed);
        this.pmCipherKey = pmc.getPublic('hex');

        console.log('Derive wallet cipher key from private key');

        mkybc = bitcoin.payments.p2pkh({ pubkey: Buffer.from(this.pmCipherKey, 'hex')});
        this.walletCipher = mkybc.address;
        this.fileKey = deriveFileKey(this.privateKey);

        // RSA mail identity tied to walletCipher
        const rsaMail = new mkyRSAMail(this.walletCipher);
        this.rsaKeys = rsaMail.generateKeys();

        this.writeWallet();
        this.newWallet = true;  
      }
   }
   async doUpdateBorgRegistry(){
     const regInfo   = this.net.wcj.imeta;
     regInfo.nicName = this.net.wcj.nicName;

     console.log(`doUpdateMyIcon() registry info`,regInfo);

     this.net.wcj.borgReg = false;
     return false;
   }
   async doUpdateMyIcon(j,res){
     const newIcon = decodeURIComponent(j.iconFile);
     this.net.wcj.icon = newIcon;
     this.net.wcj.imeta = j.icon;

     this.net.wcj.hasAccIcon = true;
     j.result = true;
     j.msg    = 'Account Icon Updated';

     // Persist to disk
     fs.writeFile(wconf, JSON.stringify(this.net.wcj), { flag: 'w' }, err => {
       if (err){
         console.log(`doUpdateMyIcon():: updateWallet.conf:: `,err);
       }
       j.result = false;
       j.msg    = `Failed To Save... Try Again Please`;
       this.net.icon = newIcon;
     });

     // Do Update BorgMail User Registry with j.icon data
     let doTry = await this.doUpdateBorgRegistry();

     j.response = j.msg;

     console.log(`doUpdateMyIcon():: final`,j);

     res.end(JSON.stringify(j));
   }
   async doCreateAccount(j,res){
     const ac = j.parms;
     this.net.wcj.nicName = ac.firstname;
     this.net.wcj.age     = ac.age;
     this.net.wcj.sex     = ac.sex;

     this.net.wcj.hasAccInfo      = true;
     j.result = true;
     j.msg    = 'Account Updated';

     // Persist to disk
     fs.writeFile(wconf, JSON.stringify(this.net.wcj), { flag: 'w' }, err => {
       if (err){
         console.log(`updateWallet.conf:: `,err);
       }      
       j.result = false;
       j.msg    = `Failed To Save... Try Again Please`;
     });

     j.response = j.msg;

     console.log(`doCreateAccount():: final`,j);

     res.end(JSON.stringify(j)); 
   }
   async doCreateOpeningBalance(){
     let doTry = await this.net.PTree.peerPaysCreateOpeningBalance(this.ownMUID);
     console.log(`doCreateOpeningBalance():: doTry`,doTry);

     if (doTry.error === false){
       try {
         const j = JSON.parse(doTry?.raw);
         if (j.result === "tranOK"){
           this.net.wcj.openBal = true;
           // Persist to disk
           fs.writeFile(wconf, JSON.stringify(this.net.wcj), { flag: 'w' }, err => {
             if (err) console.log(`updateWallet.conf:: `,err);
           });
         }
       } catch(e){
         console.log(`doCreateOpeningBalance():: JSON er`,e);
       } 
     }       
   }
   async doCreateNewUserRootRepo(){

     const newRepo = await this.net.PTree.ftreeCreateRepo(this.ownMUID,'myRoot',3);
     
     console.log(`doCreateNewUserRootRepo():: newRepo`,newRepo);   
     if (newRepo && newRepo?.error === false && newRepo?.json?.result === 'repoOK'){
       this.net.wcj.userRoot = true;
       fs.writeFile(wconf, JSON.stringify(this.net.wcj), { flag: 'w' }, err => {
         if (err) console.log(`updateWallet.conf:: `,err);
       });
       console.log(`doCreateNewUserRootRepo():: myRoot repo created`);
       return;
     }     
     console.error(`doCreateNewUserRootRepo():: failed`,newRepo);
     return;
   }
   async doUploadFile(j, res) {
     console.log('doUploadFile::',j);
  
     const r = j.repoInfo;
     if (r.ownerMUID !== this.ownMUID){
       j.result     = true;
       j.data       = `Error`;
       j.response   = `This Repo Is Read Only... Access Denied.`;
       res.end(JSON.stringify(j));
       return;
     }

     const https    = require('https');
     const FormData = require('form-data');

     const filePath = j.filePath;  

     const p = await this.net.portal.selectPortal('shardTreeCell');

     const service = {
       endPoint : '/storeShard/',
       filename : filePath,
       host     : p.host,
       port     : p.port,
       raw      : true
     };

     // Try streaming file to the shardTreeCell network.
     let doTry = await this.net.DStream.streamTo(service);
     console.log(`doUploadFile():: doTry`,doTry);

     if (doTry.result === 'xhrFail' || doTry?.res?.result !== 'STREAM_META_ACK'){
        let errorMsg = `doUploadFile():: stream to shard network failed Try later...`;
        console.log(errorMsg);
        j.result = true;
        j.data = `Error - ${errorMsg}`;
        j.response = `Error - ${errorMsg}`;
        res.end(JSON.stringify(j));
        return;
     }
     
     let doWait = await this.net.DStream.uploadResult(doTry.stream.streamId);

     // File stored OK so send meta data to the ftreeFileMgrCell
     doTry = await this.ftreeInsertFileToRepo(doTry.stream, r.ownerMUID, r.rname, r.filename,j.mimeType, r.path, r.folderID, 3,r.encrypt);
     console.log(`ftreeInsertFileToRepo():: doTry is `, doTry);
     if (!doTry){
        let errorMsg = `doUploadFile():: stream to shard network failed Try later...`;
        j.result     = true;
        j.data       = `Error - ${errorMsg}`;
        j.response   = `Error - ${errorMsg}`;
        res.end(JSON.stringify(j));
        return;
     }
     if (doTry.result === false){
        let errorMsg = doTry.msg;
        j.result     = true;
        j.data       = `Error - ${errorMsg}`;
        j.response   = errorMsg;
        console.log(`doTry:: false`,j);       
        res.end(JSON.stringify(j));
        return;
     }

     j.result = true;
     j.msg = 'File uploaded successfully.';
     j.response = j.msg;

     console.log(`doUploadFile():: final`,j);

     res.end(JSON.stringify(j));

  }
  buildShardMap(stream) {
    const shards = [];
    const fname = stream.filename;
    const chunkSize = stream.shardSize;

    for (let shardIndex = 0; shardIndex < stream.count; shardIndex++) {
      const shardHash = stream.shardHashes[shardIndex];

      const smap = {
        Result   : false,
        shardID  : shardHash.hash,         // already SHA-256 hex
        shardHID : shardHash.hashHID,      // Shard Idenity Pointer.
        startPos : shardIndex * chunkSize,
        nStored  : 0,
        index    : shardIndex,
        hosts    : [],
      };

      shards.push(smap);
    }

    return shards;
  }
  async doHandleBorgFileSys(m, res) {
    console.log(`doHandleBorgFileSys():: `, m);

    if (m.req === 'sendBorgFileSys') {
      m.url = m.service.endPoint;
      await this.doRenderFileSys(m,res);
      return;
    }
    if (m.req === 'borgUpdateResByUrl'){
      m.url = m.parms.url;
      if (m.url.startsWith('/whzon/bitMiner/sendBorgFileSys')){
        await this.doRenderFileSys(m,res);
        return;
      }
      if (m.url.startsWith(`/whzon/bitMiner/borgDelFileFromRepo`)){
        await this.doDeleteFile(m,res);
        return;
      }
      if (m.url.startsWith(`/whzon/bitMiner/createRepo.`)){
        await this.doCreateRepo(m,res);
        return;
      }
      if (m.url.startsWith(`/whzon/bitMiner/createRepoFolder.`)){
        await this.doCreateRepoFolder(m,res);
        return;
      }
    }
    res.end('doHandleBorgFileSys():: Failed.. no endpoint found');
  }
  async doCreateRepoFolder(m,res){
    console.log(`doCreateRepoFolder():: m.url`,m.url);
    let result = 'OK'
    let doTry = await this.net.UI.createRepoFolderGET(m.url);
    let html  = JSON.stringify(doTry);
    if  (doTry.status === null){
      html = JSON.stringify(doTry);
      result = 'FAIL'
    }
    console.log(`doCreateRepoFolder():: doTry`,doTry);
    const j = {
      action : m.req,
      result : true,
      res : {
        result  : result,
        url     : m.url,
        folder  : doTry.folder,
        name    : doTry.name,
        parent  : doTry.parent,
        newRepo : doTry.newRepo.json.result,
        owner   : this.ownMUID
      }, 
      html   : html,
      js     : "",
      jsID   : this.calculateHash(JSON.stringify(doTry)),
      pMUID  : this.ownMUID
    }
    console.log(`doCreateRepoFolder():: sending j`,j);
    res.end(JSON.stringify(j));
    return;
  }
  async doSendBorgTime(m,res){
    const j = {
      action   : m.req,
      borgTime : peerTCorrection,
    }
    res.end(JSON.stringify(j));
    return;
  }
  async doSendWalletOptions(m,res){
    let doTry  = 'Fill this in later';
    const html = `
      <div ID='menuBar' align='right' style='background:#222324;padding:0.5em 1em 0.5em 1em;'>
      <a href='javaScript:doCloseWalletOpt();'>Close[x]</a>
      </div>
      <div ID='walletBody' style='background:#151617;padding:0.5em;'>
      <div ID='autoSelSpot'></div>
    `;

    const j = {
      action : m.req,
      result : true,
      html   : html,
      js     : "",
      jsID   : this.calculateHash(JSON.stringify(doTry)),
      pMUID  : this.ownMUID
    }
    res.end(JSON.stringify(j));
    return;
  }
  async doCreateRepo(m,res){
    console.log(`doCreateRepo():: m.url`,m.url);

    let doTry = await this.net.UI.createRepoGET(m.url);
    let html  = JSON.stringify(doTry);
    if  (doTry.status === null){
      html = JSON.stringify(doTry);
    }
    console.log(`doCreateRepo():: doTry`,doTry);
    const j = {
      action : m.req,
      result : true,
      html   : html,
      js     : "",
      jsID   : this.calculateHash(JSON.stringify(doTry)),
      pMUID  : this.ownMUID
    }
    res.end(JSON.stringify(j));
    return;
  }
  async doDeleteFile(m,res){
    console.log(`doDeleteFile():: m.url`,m.url);
    let doTry = await this.net.UI.deleteFileFromRepoGET(m.url);
    console.log(`doDeleteFile():: doTry`,doTry);

    // 5. Build response object
    const j = {
      action : m.req,
      result : true,
      html   : doTry,
      js     : "",
      jsID   : this.calculateHash(doTry),
      pMUID  : this.ownMUID
    };

    console.log(`this.UI.dodeletFile():: `, j);
    res.end(JSON.stringify(j));
    return;
  }
  async doRenderFileSys(m,res){
    // 1. Build repo context from GET string
    console.log(`doRenderFileSys():: m.url`,m.url);

    const urlObj = new URL(m.url, "http://localhost"); // base required
    const queryString = urlObj.search.replace(/^\?/, "");

    const ctx = await this.net.UI.initRepoContextFromGET(queryString);
    console.log(`initRepoContextFromGET():: `, ctx);

    // 2. Build HTML
    const htm = await this.net.UI.getBorgFileSys(queryString);

    // 3. Load JS template
    let jsCode = fs.readFileSync('./borgHUIFileSysJS.js', 'utf8');

    // 4. Inject server-side values into the JS code
    jsCode =
      `// Injected by BorgHUI\n` +
      `var sKey      = "${ctx.sessISMOBILE ? 'MOBILE' : 'DESKTOP'}";\n` +
      `var mbrMUID   = "${ctx.mbrMUID}";\n` +
      `var rname     = "${ctx.rname}";\n` +
      `var path      = "${ctx.path}";\n` +
      `var folderID  = "${ctx.folderID}";\n` +
      `var foldName  = "${ctx.fname}";\n` +
      `var queryString = "${m.url.replace(/"/g, '\\"')}";\n\n` +
      jsCode;

    // 5. Build response object
    const j = {
      action : m.req,
      result : true,
      html   : htm,
      js     : jsCode,
      jsID   : this.calculateHash(jsCode),
      pMUID  : this.ownMUID
    };

    res.end(JSON.stringify(j));
    return;
  }
  async doSendAccountInfo(m,res){
    let j = await this.net.BPay.doSendBorgPayRecentTrans(m);
    res.end(JSON.stringify(j));
    return;    
  }
  async ftreeInsertFileToRepo(stream,muid, name, file,mimeType, path, folderID, nCopys,encrypt) {
    const j = {
      from     : muid,
      name     : name,
      file     : {
        owner     : muid,
        filename  : file,
        ftype     : mimeType,
        encrypt   : encrypt,
        shards    : this.buildShardMap(stream),
        checksum  : stream.streamId,
        fileSize  : stream.totalSize,
        shardSize : stream.shardSize 
      }, 
      path     : path,
      folderID : folderID,
      nCopys   : Number(nCopys),
    };

    // Remove leading slash if path is not root
    if (j.path !== '/') {
      j.path = j.path.replace('/', '');
    }

     const p = await this.net.portal.selectPortal('ftreeFileMgrCell');

     const service = {
       endPoint : '/netREQ/',
       host     : p.host,
       port     : p.port,
       raw      : true
     };

    const msg = {
      req   : "insertRSfile",
      reqId : crypto.randomUUID(), 
      repo  : j
    }
    console.log(`ftreeInsertFileToRepo():: `,service,msg);
    this.net.DStream.sendMsgCX(service,msg);

    const bcRes = await this.responseToRepoInsert(msg.reqId);
    return bcRes;
  }
  responseToRepoInsert(reqId){
    return new Promise( (resolve) => {
      let lsFail,lsOK;
    
      const finish = (result) => {
        this.net.removeListener('xhrFail', lsFail);
        this.net.removeListener('xhrPostOK', lsOK);
        resolve(result);
      }

      this.net.on('xhrFail', lsFail = (msg) => {
        if (msg.reqId === reqId) {
          finish(false);
        }    
      });

      this.net.on('xhrPostOK',lsOK = (msg) =>{
        if (msg.reqId === reqId) {
          finish(msg.res);
        }
      });
    });
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
   async encryptXChaCha20(msg, key) {
     await sodium.ready;

     // Convert message to Uint8Array
     const messageBytes = Buffer.isBuffer(msg)
      ? new Uint8Array(msg)
      : sodium.from_string(msg);

     // 24-byte XChaCha20 nonce
     const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
     );

     // AEAD encrypt
     const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
       messageBytes,
       null,   // no additional authenticated data
       null,   // no secret nonce
       nonce,
       key
     );

     return {
       nonce: Buffer.from(nonce),
       ciphertext: Buffer.from(ciphertext)
     };
   }
   async decryptXChaCha20(ciphertext, nonce, key) {
     await sodium.ready;

     const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
       null,   // no secret nonce
       new Uint8Array(ciphertext),
       null,   // no AAD
       new Uint8Array(nonce),
       key
     );

     return Buffer.from(plaintext).toString("utf8");
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
   async doRSVExecuteCmd(j,res){
     let service = await this.net.portal.selectPortal(svcName);
     if (service.endPoint === '' || service.endPoint === null){
       service.endPoint === '/netREQ';
     }
     var conf = confirm("run service https://"+service.host+':'+service.port+'/'+service.endPoint+" Now?");
     if (conf){
       this.sendPostRequest(msg,div,service);
     }
   }
   getBorgToken(){
     const reqId   = crypto.randomUUID();
     const reqTime = Date.now();
     const btok    = `${this.ownMUID}-${reqTime}-${reqId}`;

     const borgToken = {
       reqId   : reqId,
       reqTime : reqTime,
       Address : this.ownMUID,
       sesTok  : btok,
       pubKey  : this.publicKey,
       sesSig  : this.signMsg(btok),
     }
     return borgToken;
   }
   sendPostRequest(msg,wres=null,service=null,redirectCount=0){
     return new Promise((resolve) => { 
       const MAX_REDIRECTS = 5; // Limit the number of redirects

       msg.borgToken = this.getBorgToken();

       if (redirectCount > 0 ) {
         console.log('REDIRECT::',redirectCount,service);
       }
       if (redirectCount > MAX_REDIRECTS) {
         console.log("Maximum redirects reached. Aborting request.");
         resolve(null);
         return;
       }


       if (service === null){
         service = {
           endPoint : '/whzon/gold/netWalletAPI.php',
           host     : 'web.bitmonky.com',
           port     : ''
         }
       }
       //console.log('sendPostRequest():: sending msg :',msg,service);
       const https = require('https');

       const data = JSON.stringify(msg);
       const agent = new https.Agent({
         rejectUnauthorized: false 
       });
       //console.log('Service::: ',service);
       const headers = {};

       if (service.raw === true) {
         // Do NOT set JSON headers
         headers['Content-Type'] = 'text/plain';
         headers['Content-Length'] = Buffer.byteLength(data);
       } else {
         // JSON mode
         headers['Content-Type'] = 'application/json';
         headers['Content-Length'] = Buffer.byteLength(data);
       }


       const options = {
         hostname : urldecode(service.host),
         port     : urldecode(service.port),
         path     : encodeURI(service.endPoint),
         method   :'POST',
         agent    : agent,
         headers  : headers,
       }
       const req = https.request(options, res => {
         let chunks = [];
         res.on('data', (chunk)=>{
            chunks.push(chunk);
         });

         res.on('end',async ()=>{
           const body = Buffer.concat(chunks);
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
               await this.sendPostRequest(msg, wres, newService, redirectCount + 1);
             } 
             else {
               console.log('Redirect response received, but no location header provided.');
               resolve(null);
               return;
             }
           }
           else if (res.statusCode != 200) {
             console.log("Api call failed with response code " + res.statusCode);
             resolve(null);
             return;
           } 
	   else {
             //console.log('API Response:->',body);
             // Only treat raw mode as true if explicitly set to true
             if (service.raw === true) {
               resolve(body);
               return;
             }
             try {
               this.handleResponse(JSON.parse(body),wres);
               resolve(true);
             }
             catch(err) {
               resolve(null);
               console.log(err);
             }
           }
         });
       });
       req.on('error', error => {
          console.log(error);
       });

       req.write(data);
       req.end();
     });
   } 
};

const myWallet = new bitMonkyWSrv();

module.exports.bitMonkyWSrv = bitMonkyWSrv;
