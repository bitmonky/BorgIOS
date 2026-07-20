const crypto              = require('crypto');
const axios               = require('axios');
const {BorgAccessAPI}     = require('./borgAccessAPI.js');
const {BorgCoreSystems}   = require('./borgCoreSystems.js');
const {BorgRepoStreamMgr} = require('./borgRepoStreamMgr.js');
const {BorgIOSptreeAPI}   = require("./borgIOSptreeAPI.js");
const {BorgIOSmemoryMgr}  = require('./borgIOSmemoryMgr.js');

const fs     = require('fs');
const fsp    = require('fs').promises;
const path   = require('path');
const zlib   = require('zlib');

const MAX_STATE_SIZE = 102400; // 100KB
const STATE_DIR = '/peerTree/keys/';
const STATE_FILE = path.join(STATE_DIR, 'current.borgstate');
const SHUTDOWN_CODE_FILE = path.join(STATE_DIR, '.shutdown.code');

const BORG_masterRepo = 'BorgIOS.net';
const BORG_appPath    = 'src'; 

const algorithm = 'aes256';
const MKYC_portDeepSeek = 13581;

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
const mimeTypes = [
  "text/x-csrc",
  "text/x-c++src",
  "text/x-python",
  "application/x-ruby",
  "application/x-perl",
  "text/x-java-source",
  "text/x-markdown",
  "application/x-yaml",
  "text/yaml",
  "application/json",
  "application/xml",
  "application/x-sh",
  "application/x-bash",
  "application/x-tcl",
  "application/octet-stream",
  "text/plain",
  "text/html",
  "text/css",
  "text/csv",
  "text/javascript",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-sh"
];

const prompt = `IMPORTANT ** Repositories are case sensitive... It contains the only files you have access to.
          Filenames not listed here do not exist and are hallucinations. Memories referencing them should be disregarded and pruned out.
          `;


function doIndent(n) {
  return ' '.repeat(n);
}

class BorgAgentBrain {
  constructor(receptor) {
    this.receptor      = receptor;
    this.net           = receptor.peer.net;
    this.borgAID       = receptor.peer.net.peerMUID;
    this.borg          = new BorgAccessAPI(receptor.peer.net);
    this.csys          = new BorgCoreSystems(this);
    this.DStream       = new BorgRepoStreamMgr(receptor.peer.net);
    this.PTree         = new BorgIOSptreeAPI(receptor.peer.net);
    this.MemMgr        = new BorgIOSmemoryMgr(receptor.peer.net,this);

    this.maxLines      = 100;
    this.maxMemReq     = 8;
    this.RASMax        = 15;
    this.DMBMax        = 20;
    this.CHATMax       = 20;
    this.SHORTMMax     = 20;
    this.nActions      = 0;
    this.maxActions    = 10;            // maximum calls to LLM api per session;
    this.delayTime     = 1;             // Time in seconds
    this.stateRestored = false;
    this.protocol      = null;
    this.DMB           = [];
    this.RDC           = [];
    this.DOCR          = '';
    this.REPO          = [];
    this.REPOR         = '';
    this.RASB          = [];
    this.CHAT          = [];
    this.sysResponse   = [];
    this.sysResMax     = 8;
    this.BORGO         = [];
    this.agentSpecialty = 'No Specialty Chosen';
    this.SHORTM         = [];

    this.tryRestoreState();
    this.registerShutDown();
    this.activateBrain();
    this.startRepoReader();
  }
  startRepoReader(){
    this.doFetchCodeRepo(null);
    setTimeout(() => {
      this.startRepoReader();
    },60*60*1000);
  }
  async activateBrain(){
    this.csys.checkForCoreEngineer();
    this.buildPrompt();
    const agentRes = await this.receptor.sendOAIPrompt(this.core);
    if (agentRes){
      this.sysResponse = [];  // clear old system responses;
      this.DOCR = 'No Document Loaded.';
      await this.doProcessAgentResponse(agentRes);
      this.nActions++;
    }
    else {console.log('Agent response failed... Trying again');}
    
    let getMoreInput = setTimeout(()=>{
      if (this.nActions < this.maxActions){
        this.activateBrain();
      }
    },this.delayTime*1000);
  }
  async processRemGroupChat(j,remIp,type){
    this.CHATG = this.trimBuffer(this.CHATG,this.CHATGMax);
    this.CHATG.push({msgID:calculateHash(JSON.stringify(j)+Date.now()),type:type,agentReply:j});
    console.log('groupChat: ',{msgID:calculateHash(JSON.stringify(j)+Date.now()),type:type,agentReply:j});
  }
  mergeRepos(newRepo) {
    const mergedRepo = {};

    this.REPO.forEach(entry => {
      mergedRepo[entry.key] = { ...entry };
    });

    newRepo.forEach(entry => {
      if (mergedRepo[entry.key]) {
        mergedRepo[entry.key].lastLine = Math.max(mergedRepo[entry.key].lastLine, entry.lastLine);
      } else {
        mergedRepo[entry.key] = { ...entry };
      }
    });

    this.REPO = Object.values(mergedRepo);
  }
  processSharedDocHistory(j){
    if (j.REPO && Array.isArray(j.REPO)){
      this.mergeRepos(j.REPO);
    } 
  }
  extractHUIResponse(j){
    if (j.req == 'sendHUIReply'){
      return j;
    }
    var xreq = null;
    if (j.requests) {
        j.requests.forEach((mreq, index) => {
            if (mreq.req == 'sendHUIReply' && xreq === null) { // Ensure we only remove one item
                xreq = mreq;
                j.requests.splice(index, 1);
            }
        });
    }
    return xreq;
  }
  processHUIChat(j,type='newMsg(HUI)'){
    return new Promise(async(resolve,reject) => {
      this.CHAT = this.trimBuffer(this.CHAT,this.CHATMax);
      const chatID = calculateHash(JSON.stringify(j)+Date.now());
      this.CHAT.push({msgID : chatID,type:type,msgFrom:j.msg.ownMUID,msg:j.msg.msg});
      const chatBody = this.buildHUIChatResponse(j);
      const chatRes = await this.receptor.sendOAIPrompt(chatBody);
      if (chatRes){
        const jchat = await this.json_AgentDecode(chatRes);
        console.log('Agent chatResponse:',jchat);
        if (jchat){
          const xchat = this.extractHUIResponse(jchat);
          if (xchat.req == 'sendHUIReply' && jchat.msgBody){
            this.CHAT.push({msgID:calculateHash(JSON.stringify(chatRes)+Date.now()),type:'sendReply',msgFrom:"Me",msg:jchat.msgBody});
            resolve({result:true,reply:jchat.msgBody});
          }
          if (jchat.req !== 'sendHUIReply'){
            this.doProcessAgentResponse(JSON.stringify(jchat));
            resolve({result:false,error:"BorgResponse... Busy will respond later."});
          }
        }
      }
      else {
        resolve({result:false,error:"No BorgResponse."});
      }
    });
  }
  buildHUIChatResponse(j){
    const isChat   = true;
    var chatBody = '';
    chatBody += this.buildCore();
    chatBody += this.getMnemoProtocol(isChat);
    chatBody += this.getRecentActivity(isChat);
    chatBody += this.getDynamicMemory(isChat);
    chatBody += this.getDocumentReader(isChat);
    chatBody += this.getBorgChatActivity(isChat);
    chatBody += `
    \n New borgChat Message:
    You have received a instant chat message from a human user of the BorgHUI (borg human interface) App, use this protocol to respond:
      {"req":"sendHUIReply","msgBody":"Build Your Reply Here","agentID":"${this.borgAID}"}

      Message Recieved:
        ${JSON.stringify(j)}
      End Message:

    End Notification:
    `;
    console.log('HUI::msgBody:',chatBody);
    return chatBody
  }
  removeCHAT(chatID){
    let index = this.CHAT.findIndex(item => item.mhash === chatID); 
    if (index !== -1) {
      this.CHAT.splice(index, 1); 
      console.log(`CHAT chatID ${chatID} has been removed.`);
    }
  }
  extractRemChat(j){
    var xreq = [];
    if (j.req == 'sendReply'){
      xreq.push(j);
      return xreq;
    }
    var xreq = [];
    if (j.requests) {
        j.requests.forEach((mreq, index) => {
            if (mreq.req == 'sendReply' && xreq === null) { // Ensure we only remove one item
                xreq.push(mreq);
                j.requests.splice(index, 1);
            }
        });
    }
    if (xreq.length == 1){
      return xreq[0];
    }
    return xreq;
  } 
  getRemIp(chatArray, targetMsgFrom) {
    let match = chatArray.find(chat => chat.msgFrom === targetMsgFrom);
    return match ? match.remIp : null; // Returns remIp if found, otherwise null
  }

  async processRemChat(j,remIp,type){
    this.CHAT = this.trimBuffer(this.CHAT,this.CHATMax);
    this.CHAT.push({msgID : calculateHash(JSON.stringify(j)+Date.now()),type:type,msgFrom:j.remMUID,remIp:remIp,msg:j.msg});
    this.buildChatResponse(j);
    const chatRes = await this.receptor.sendOAIPrompt(this.chatBody);
    if (chatRes){
      const jchat = await this.json_AgentDecode(chatRes);
      console.log('Agent chatResponse:',jchat);
      const xchat = this.extractRemChat(jchat);
      xchat.forEach((xc) =>{
        this.CHAT.push({msgID:calculateHash(JSON.stringify(chatRes)+Date.now()),type:'sendReply',msgFrom:"Me",msg:xc.msgBody});
        const toIp = this.getRemIp(this.CHAT,xc.toAgentID);
        this.receptor.sendBorgChatReply(remIp,xc.msgBody);
        this.respondToBorg(xc,'OK reply sent');
      });
      this.doProcessAgentResponse(JSON.stringify(jchat));
    }
    else {
      console.log('Agent chatResponse failed... Trying again');
    } 
  }
  buildChatResponse(j){
    const isChat   = true;
    this.chatBody  = this.buildCore();
    this.chatBody += this.getMnemoProtocol(isChat);
    this.chatBody += this.getRecentActivity(isChat);
    this.chatBody += this.getDynamicMemory(isChat);
    this.chatBody += this.getDocumentReader(isChat);
    this.chatBody += this.getBorgChatActivity(isChat);
    this.chatBody += `
    \n New borgChat Message:
    You have received a instant chat message from another BorgAgent, use this protocol to respond:
      {"req":"sendReply","toAgentID":"remoteAgentID","msgBody":"Build Your Reply Here","agentID":"${this.borgAID}"}
    
      Message Recieved: 
        ${JSON.stringify(j)}  
      End Message:  

    End Notification:
    `;
    console.log(this.chatBody);
  }
  tryRestoreState(){
    this.stateRestored = false; // Explicit declaration
    console.log('Checking For State Information...');
        
    if (fs.existsSync(STATE_FILE)) {
      console.log('State File Found.. Trying to restore!');
      const shutdownCode = fs.existsSync(SHUTDOWN_CODE_FILE) 
        ? fs.readFileSync(SHUTDOWN_CODE_FILE, 'utf8').trim() 
        : null;

      this.stateRestored = this.restoreAgentState(shutdownCode);
      if (this.stateRestored){
        this.DMB  = this.trimDMB(this.DMB,this.DMBMax);
        this.RASB = this.trimBuffer(this.RASB,this.RASMax);
        this.CHAT = this.trimBuffer(this.CHAT,this.CHATMax);
        console.log( " [State restored from  STATE_FILE]");
      }
    }
  } 
  registerShutDown(){
    process.on('exit', () => {
      if (!process.connected) {
        this.doShutdown();
      }
    });

    process.on('SIGINT', () => {
      console.log('Received SIGINT. Shutting down...');
      this.doShutdown();
      process.exit();
    });

    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      this.doShutdown();
      process.exit(1);
    });
  }
  doProcessAgentResponse(agentRes){
    console.log('Agent Borg Says:: ',agentRes);
    const respID = calculateHash(agentRes+Date.now());
    this.RASB.push({mHash:respID,memStr:"Agent Request: "+agentRes});

    return new Promise(async(resolve,reject)=>{
      var req = null;
      req = await this.json_AgentDecode(agentRes);
      if (req){
        if(req.requests){
          req.requests.forEach(async(mreq)=>{
            await this.handleBorgResponse(mreq);
          });
        }
        else {
          await this.handleBorgResponse(req);
        }
      }
      else {
        await this.handleBorgResponse(req);
      }
      resolve(true);
    }); 
  }
  json_AgentDecode(agentRes) {
    return new Promise(async(resolve,reject)=>{
     var jsonStr = agentRes;
     const maxTry = 2;
     let rTry = 0;

     while (rTry <= maxTry) {
       try {
         const req = JSON.parse(jsonStr);
         if (req) {
           resolve(req);
           return;
         }
       } catch (error) {
         jsonStr = await this.agentJRepair(jsonStr, "deepseek-reasoner");
       }
       rTry++;
     }
     resolve(null);
   });
 }

 agentJRepair(jsonStr, mod) {
   return new Promise(async(resolve,reject)=>{
     const prompt = `There is an error in this JSON string '${jsonStr}', please respond with the corrected JSON string only. Do not explain the changes.
     If there are more than one JSON req structures, then wrap them like this: {"requests": [{"req":"req"},...]}."`;

     const result = await this.receptor.sendOAIPrompt(this.core);
     resolve(result);
     return;
   });
 }  
 async buildPrompt(){
    this.agentPrompt = this.getAgentPrompt();
    this.core = this.buildCore();
    this.getMnemoProtocol();
    this.getRecentActivity();
    this.getDynamicMemory();
    this.getDocumentReader();
    this.getBorgChatActivity();
    this.putSysResponses();
    console.log(this.core);
  }
  getRecentActivity(isChat=false){
    var tempStr; 
    tempStr  = "\nRecent Activity Section: \n  Use this section to keep track of what you have already done. \n";
    tempStr  += this.serializeHistory(this.RASB);
    tempStr  += "\nEnd Section: \n";
    if (isChat){
      return tempStr;
    }
    this.core += tempStr;
  }
  getDynamicMemory(isChat=false){
    var tempStr;
    tempStr  = `\nYour Dynamic Memory Buffer:\n  
      This is where you will find the information you have requested or have stored in long term memory. 
      You can req for memories no longer relevent to be removed with {req:pruneMemory} protocol\n
      You can search for long term stored memories using the {req:getMemory} protocol.\n\n`;

    tempStr += this.serialize(this.DMB,'memoryID');
    tempStr += "\nEnd DMB:\n Reminder: Respond in valid JSON format only. \n";
    this.DMBMax    = 20;
    if (isChat){
      return tempStr;
    }
    this.core += tempStr;
  }
  getDocumentReader(isChat=false){
    var tempStr;
    tempStr  = "\nDocument Reader Buffer: \n";
    tempStr += this.serializeDocument();
    tempStr += "\nEnd DocumentReader: \n";
 
    tempStr += "\nBorgIOS Code Repository Reader Buffer: \n";
    tempStr += this.REPOR; // this.serializeRepoReadState();
    tempStr += "\nEnd RepDocumentReader: \n";

    tempStr += "\nShort Term Memory Buffer:\n";
    tempStr += "You can store temporary memories to help keep track of your current work flow... They will exist until you remove them. Once removed they can not be retrieved.";
    tempStr += this.serializeShortTermMemory();
    tempStr += "\nEnd ShortTermMemory: \n";
 
    if (isChat){
      return tempStr;
    }
    this.core += tempStr;
  }
  serializeShortTermMemory(){
    let s = "\n";

    if (this.SHORTM.length === 0) {
      s += "\nNo Short Term Memories Created.";
      return s;
    }

    this.SHORTM.forEach((r,index) => {
      s += `\nshortMemID :  [${index}] - ${JSON.stringify(r.memory)}] date:  [${r.date}`;
    });

    return s;
  }
  putSysResponses(){
    this.core += "\nSystem Response(s) Section:\n";
    this.core += this.serialize(this.sysResponse,'sysResponseID');
    this.core += "\nEnd System Response(s)\n";
  }
  getBorgChatActivity(isChat=false){
    var tempStr;
    tempStr  = "\nAgent Chat Activity Section: \n  Tracks your conversations with other BorgIOS Agents. \n";
    tempStr  += this.serializeChat(this.CHAT);
    tempStr  += "\nEnd Section: \n";
    if (isChat){
      return tempStr;
    }
    this.core += tempStr;
  }
  serializeChat(buffer){
    let chatStr = '';
    buffer.forEach((chat,index) => {
      chatStr += `\n  [${index + 1}.] - `;
      chatStr += `{"Type":"${chat.type}","from":"${chat.msgFrom}","msg":"${JSON.stringify(chat.msg)}"} `;
      chatStr += `\n`;
    });
    chatStr += '\n  Other Borg Agents Online:'
    this.BORGO.forEach((borg,index) => {
      chatStr += "\n    remoteAgentID: "+borg.agentID+' Specialty:'+borg.specialty;
    });
    chatStr += `\n\n  Use this powerfull tool to colaborate other borgIOS Agents (highly Recomended): `;
    chatStr += `\n  Sending Messages: \n  {"req":"sendMsg","toAgentID":"remoteAgentID","msgBody":"build your message here","agentID":"${this.borgAID}"} `;
    chatStr += `\n  Required fields : all \n`;
    chatStr += `\n  Reply To Messages : \n  When replying substitute the "sendMsg" in the "req" field with "sendReply". `;  
    chatStr += `\n  Sharing MemoryID(s): - Use the following protocol to load memories by memoryID `;
    chatStr += `\n  {"req":"getMemoryById","memoryIDs","["memoryID":"request memoryID",... ]","agenID":"$this.borgAID}"} `;
    chatStr += `\n  IMPORTANT! memoryIDs can not be truncated only the full length is required to properly share/retrive memories between agents. `;
    return chatStr;
  }
  serializeHistory(buffer) {
    let RASStr = '';
    this.RASB = this.trimBuffer(buffer,this.RASMax);
    buffer.forEach((histRec, index) => {
      RASStr += `\n  [${index + 1}.] - `; 
      RASStr += histRec.memStr;
      RASStr += "\n";
    });

    if (buffer.length === 0 || RASStr === '') {
      RASStr = '  [Empty Buffer] \n';
    }

    return RASStr;
  }
  serialize(buffer,action = 'memoryID') {
    let RASStr = '';
    this.RAS = this.trimBuffer(buffer,this.DMBMax);
    var  nranked = 0;
    buffer.forEach((histRec, index) => {
      var hID = index +1;
      if (action == 'memoryID'){ 
        hID = histRec.mhash;
      }
      if (action == 'memoryID'){
        RASStr += `\n{"${action}":"${hID}","${action.replace('ID', '')}"`;
        if(histRec.rank){
          RASStr += `,"rank":${histRec.rank}":`;
        } else {
          RASStr += `,"rank":null}:`;
        }
      } 
      RASStr += histRec.memStr;
      RASStr += "}\n";
      if (!histRec.rank){
        nranked++;
      }
    });
    if (action == 'memoryID' && nranked > 0){
      RASStr += `
      Reminder: ${(nranked)} of your DMB memories are NOT ranked:
        Rank the importance of memories in your DMB so the API will trim the lowest values first when the buffer size is exceeded.
        {"req":"rankMemories","memoryIDs":[{"memoryID":"ID","rank": integer [1 to 1000] where 1000 is most important)},...],"agentID":"${this.borgAID}"}
        require fields: all.
     `;
    } 
    if (buffer.length === 0 || RASStr === '') {
      RASStr = '  [Empty Buffer] \n';
    }
    return RASStr;
  }
  serializeDocument(){
    if (this.DOCR && this.DOCR != ''){
      return this.DOCR;
    } 
    var docStr = '  [Empty - no documents loaded.]';
    return docStr;
  }
  serializeRepo(){
    console.log('REPORRRRRRRRRRR',this.REPOR);
    if (this.REPOR && this.REPOR != ''){
      return this.REPOR;
    }
    var docStr = '  [Empty - repository not loaded to save space.]';
    return docStr;
  }
  trimDMB(DMB, BMax) {
    // Step 1: Assign temporary rank of 0 to null ranks
    DMB.forEach(item => {
      if (!item.rank) {
        item.rank = 0;
      }
    });

    // Step 2: Sort by rank (ascending order: lowest first)
    DMB.sort((a, b) => a.rank - b.rank);

    // Step 3: Trim the array to BMax length
    const trimmedDMB = DMB.slice(-BMax);

    // Step 4: Reassign rank 0 back to null
    trimmedDMB.forEach(item => {
      if (item.rank === 0) {
        item.rank = null;
      }
    });

    // Step 5: Return the adjusted array
    return trimmedDMB;
  }
  trimBuffer(B, BMax) {
    while (B.length > BMax) {
       B = B.slice(-BMax);
    }
    return B;
  }
  getToIp(agentID) {
      console.log('Start Find remoteAgent IP: ', agentID);
      const borg = this.BORGO.find(borg => borg.agentID === agentID);
      if (borg) {
        console.log(`Found IP for ${agentID}: ${borg.IP}`);
        return borg.IP;
      }
      console.log(`No IP found for ${agentID}`);
      return null;
  }
  async handleBorgResponse(req) {
    return new Promise(async(resolve,reject)=>{
    console.log(`handleBorgResponse():: req`,req);
    if (!req) {
      this.respondEr('Invalid JSON in your response. Please try again.', req);
      return;
    }

    if (!req.req) {
      this.respondEr('API error - Invalid JSON, "req" is not set. Please try again.', req);
      return;
    }

    switch (req.req) {
      case 'sendMsg':
        let ip = this.getToIp(req.toAgentID);
        if (ip){
          this.receptor.sendBorgChat({req:'chat',msg:req.msgBody,toIp:ip,agentID:this.borgAID});
        } else { 
          this.respondEr(`sendMsg failed... agentID ${req.toAgentID} not found`,req);
        }
        break;
      case 'sendReply':
        let rip = this.getToIp(req.toAgentID);
        if (rip){
          this.CHAT.push({msgID:calculateHash(JSON.stringify(req.msgBody)+Date.now()),type:'sendReply',msgFrom:'Me',msg:req.msgBody});
          this.receptor.sendBorgChatReply(rip,req.msgBody);
          this.respondToBorg(req,`OK`);
        } else {
          this.respondEr(`sendReply failed... agentID ${req.toAgentID} not found did you mean sendHUIReply?`,req);
        }
        break;
      case 'createShortMem':
        this.doCreateShortMem(req);
        break;
      case 'removeShortMem':
        this.doRemoveShortMem(req);
        break;
      case 'sendHUIReply':
        this.respondToBorg(req,`OK`);
        break;
      case 'putMemory':
        await this.doStoreMemory(req);
        break;
      case 'getMemory':
        await this.doSearchMemory(req);
        break;
      case 'getMemoryById':
        await this.doGetMemoriesById(req);
        break;
      case 'rankMemories':
        this.doRankMemories(req);
        break;
      case 'pruneMemory':
        this.doPruneMemory(req);
        break;
      case 'fetchRecDoc':
        if (!req.startLine || !req.endLine) {
          this.respondEr('startLine or endLine fields are missing or invalid... please try again', req);
          return;
        }
        await this.doFetchRecDoc(req, req.startLine, req.endLine);
        break;
      case 'fetchRepoFile':
        if (!req.startLine || !req.endLine) {
          this.respondEr('startLine or endLine fields are missing or invalid... please try again', req);
          return;
        }
        await this.doGetFileFromRepo(req, req.startLine, req.endLine);
        break;
      case 'loadCodeRepo':
        await this.doFetchCodeRepo(req);
        break;
      case 'putMemories':
        await this.doStoreMemories(req);
        break;
      case 'selectMySpecialty':
        await this.doSelectMySpecialty(req);
        break;
      case 'improveAgent':
        await this.doSelfImprovePrompt(req);
        break;
      case 'endSession':
        console.log('EndSession Requested');
        break;
      default:
        const res = await this.csys.handleBorgResponse(req);
        if (!res){
          this.respondEr('API error - Invalid Agent Request ... please try again', req);
        } 
    }
    resolve(true);
    });
  }
  doCreateShortMem(req){
     const mem = {
       memory:req.memory,
       date:Date.now()
     }
     this.SHORTM = this.trimBuffer(this.SHORTM,this.SHORTMMax);
     this.SHORTM.push(mem);

     this.respondToBorg(req,'OK');
  }
  doRemoveShortMem(req){
     this.SHORTM.splice(req.shortMemID,1);
     this.respondToBorg(req,'OK');
  }
  doSearchMemory(req) {
    return new Promise(async (resolve,reject)=>{
      console.log("Starting Memory Search");

      if (!req.qry) {
        resolve(false);
        return this.respondEr("Invalid request: qry is missing. Please try again.", req);
      }

      const mbrMUID = this.net.borgMasterID;
      const qry = req.qry.substring(0, 500);
      const type = 'BorgAgentMem';

      let response = await this.borg.ptreeSearchMem(mbrMUID, qry,type,null,null);
      if (typeof response === "string") {
        response = response.replace(/"{/g, "{")
                         .replace(/}"/g, "}")
                         .replace(/\\"/g, "\"")
                         .replace(/NULL/g, "");
      }
      var parsedResponse = null;
      try {
        parsedResponse = JSON.parse(response);
      }
      catch (err) {
        console.log(err);
        resolve(false);
        this.respondEr("Sorry there was a problem with the search memory sub system",req);
        return;
      }
      if (parsedResponse.result) {
        console.log("Search Result:");
        const nRec = parsedResponse.data.length;

        if (nRec > 0) {
          console.log(`Records found: ${nRec}`);
        } 
        else {
          resolve(false);
          return this.respondEr("No memories found for your request. Please try a different search.", req);
        }

        let maxn = 2;
        let nMem = 0;

        for (const qrec of parsedResponse.data) {
          if (nMem >= maxn) break;
            nMem += await this.doGetMemory(req, qrec, nMem, req.qry);
        }

        if (nMem > 0) {
          resolve(true);
          return this.respondToBorg(req, `OK ${nMem} memories added. If they seem redundant, consider using the pruneMemory protocol.`);
        } 
        else {
          resolve(false);
          return this.respondEr("No new memories found for the query. Try something else.", req);
        }
      }
      else {
        resolve(false);
        return this.respondEr("No memories found for the query. Try something else.", req);
      }
    });
  }

  inMHashBuf(buffer,mhash){
    for(var i=0; i < buffer.length; i++){
      if (buffer[i].mhash == mhash){
        return true;
      }
    }
  }
  doRankMemories(req){
    console.log(`Starting doRankMemories:`);

    if (!Array.isArray(req.memoryIDs)) {
      this.respondEr('Require field "memoryIDs" not found or is not an array.',req);
      return;
    }
    if (req.memoryIDs.length == 0) {
      this.respondEr('No Memorys In "memoryIDs" list.',req);
      return;
    }    
    var n = 0;
    req.memoryIDs.forEach((mem) => {
      let index = this.DMB.findIndex(item => item.mhash === mem.memoryID); 
      if (index !== -1) {    
        this.DMB[index].rank = mem.rank;
        n++;
      }
    });
    this.respondToBorg(req,`OK ${n} memories ranked.`); 
  }
  doGetMemoriesById(req){
    return new Promise(async (resolve,reject)=>{
      console.log(`Starting doGetMemoryById: ${req.memoryID}`);

      if (!Array.isArray(req.memoryIDs)) {
        this.respondEr('Require field "memoryIDs" not found or is not an array.',req);
        resolve(false);
        return;
      }
      if (req.memoryIDs.length == 0) {
        this.respondEr('No Memorys In "memoryIDs" list.',req);
        resolve(false);
        return;
      }  
      await Promise.all(req.memoryIDs.map(memoryID => this.doGetMemoryById(memoryID, req)));
      resolve(true);
    });
  } 
  doGetMemoryById(memoryID,req) {
    return new Promise(async (resolve,reject)=>{
      console.log(`Starting doGetMemoryById: ${memoryID}`);

      if (!memoryID) {
        this.respondEr('Require field "memoryID" not found.',req);
        resolve(0);
        return;
      }

      const data = `rname=Collective+Memories&fname=${memoryID}.mem&path=UserProfiles&folderID=0`;
      const url = `https://web.bitmonky.com/whzon/bitMiner/getFileFromRepo.php?${data}`;

      try {
        const response = await fetch(url);
        var  memory = await response.text();

        memory = memory.trim();
        if (!memory || memory == '' || memory.startsWith("FILE_NOTFOUMD.:")) {
          this.respondEr(`Error ${memory} - while retrieving memory file from repo... make sure you have the full mhash string for the memory you are requesting to load.`, r);
          resolve(false);
          return;
        }
        const jMem = JSON.parse(memory);

        if (!jMem) {
          resolve(0);
          this.respondEr(`Memory ${memoryID} not found.`,req);
          return;
        }

        if (this.DMB && this.inMHashBuf(this.DMB,memoryID)) {
          console.log(`Memory already in Buffer... memoryID: ${memoryID}`);
          this.respondEr(`Memory already in Buffer... memoryID: ${memoryID}`,req);
          resolve(0);
          return;
        }

        const pMem = JSON.stringify({
          qry: `"getMemoryById":"${memoryID}"`,
          resultNbr: 1,
          resultMemory: jMem.memory,
        });

        // Store memory into global DMB as an associative array
        this.DMB = this.DMB || [];
        this.DMB.push({mhash:memoryID,memStr:pMem});
        this.respondToBorg(req,'OK');
        resolve(1);
        return;
      }
      catch (error) {
        console.error(`Error fetching memory from repo: ${error}`);
        this.respondEr(`System Error fetching memory from repo: ${error}`,req);
        resolve(0);
        return;
      }
    });
  }
  doGetMemory(req, tRec, rNbr, qry) {
    return new Promise(async (resolve,reject)=>{
      console.log(`Starting doGetMemory: ${tRec.pmcMemObjID}`);

      const memoryID = tRec.pmcMemObjID;
      if (!memoryID) {
        resolve(0);
        return;
      }

      const data = `rname=Collective+Memories&fname=${memoryID}.mem&path=UserProfiles&folderID=0`;
      const url = `https://web.bitmonky.com/whzon/bitMiner/getFileFromRepo.php?${data}`;

      try {
        const response = await fetch(url);
        const memory = await response.text();
        const jMem = JSON.parse(memory);

        if (!jMem) {
          resolve(0);
          return;
        }

        if (this.DMB && this.inMHashBuf(this.DMB,memoryID)) {
          console.log(`Memory already in Buffer... memoryID: ${memoryID}`);
          resolve(0);
          return;
        }

        const pMem = JSON.stringify({
          qry: qry,
          resultNbr: rNbr + 1,
          resultMemory: jMem.memory,
        });

        // Store memory into global DMB as an associative array
        this.DMB = this.DMB || [];
        this.DMB.push({mhash:memoryID,memStr:pMem});

        resolve(1);
        return;
      } 
      catch (error) {
        console.error(`Error fetching memory from repo: ${error}`);
        resolve(0);
        return;
      }
    });
  }
  doGetFileFromRepo(r, start, end) {
    return new Promise(async (resolve,reject)=>{
/*
      const isRead = await this.getRepoReadState(r, start, end);
      if (isRead) {
        this.respondEr(isRead, r);
        resolve(false);
        return;
      }
*/
      if ((end - start) > this.maxLines){
        this.respondEr(`startLine/endLine range error... maxLines : ${this.maxLines} exceeded`, r);
        resolve(false);
        return;
      }

      if (start > end) {
        this.respondEr('startLine/endLine range error... correct and try again', r);
        resolve(false);
        return;
      }

      if (!r.rname) {
        this.respondEr('Required field "rname" is missing... correct and try again', r);
        resolve(false);
        return;
      }

      if (!r.path) {
        this.respondEr('Required field "path" is missing... correct and try again', r);
        resolve(false);
        return;
      }

      if (!r.filename) {
        this.respondEr('Required field "filename" is missing... correct and try again', r);
        resolve(false);
        return;
      }

      if (r.folderID === undefined || r.folderID === null) {
        this.respondEr('Required field "folderID" is missing... correct and try again', r);
        resolve(false);
        return;
      }

      console.log(`Starting doGetFileFromRepo: ${r.rname}/${r.path}/${r.filename}`);

      const data = `rname=${r.rname}&fname=${r.filename}&path=${r.path}&folderID=${r.folderID}`;
      const url = `https://web.bitmonky.com/whzon/bitMiner/getFileFromRepo.php?${data}`;

      try {
        //const response = await fetch(url);
        var file = await this.getRepoFileByName(r.rname,r.filename,r.path,r.folderID);
        console.log(`fileRetrieved:\n${file.substring(0, 250)}`);
        //process.exit(1); 
        file = file.trim();
        if (!file || file == '' || file.startsWith("FILE_NOTFOUMD.:")) {
          this.respondEr(`Error ${file} - while retrieving file from repo... use the loadCodeRepo protocol to check file location.`, r);
          resolve(false);
          return;
        }

        const fileLines = file.split("\n");
        let n = 1;
        if (r.path !== '/'){
          this.DOCR = `Current Document::Repo: ${r.rname} - ${r.path}/${r.filename}\n`;
        }
        else {
          this.DOCR = `Current Document::Repo: ${r.rname} - /${r.filename}\n`;
        }         
        fileLines.forEach(line => {
          const numberedLine = `${line}\n`;
          if (n >= start && n <= end) {
            this.DOCR += `[${n}] - ${numberedLine}`;
          }
          n++;
        });

        this.DOCR += `\nLines: [${start}] - [${end}] of [${n - 1}]`;
        this.trackRepoState(r, 1, end, n - 1);

        if (end >= n) {
          global.DOCR += " EOF!";
          this.respondToBorg(r, "Repo Document Read.", `End of File Found at line[${n - 1}]... You should write a comprehensive summary and save it using the putMemory protocol.`);
          resolve(true);
        } else {
          this.respondToBorg(r, "Document Read Partial... use putMemory protocol then call fetchRepoFile to read up to " + this.maxLines + " more lines.");
          resolve(true);
        }

        return;
      }
      catch (error) {
        console.error("Error fetching file from repo:", error);
        this.respondEr("The file you are looking does not exist... use loadCodeRepo protocol for the complete list of files you have access to.", r);
        resolve(false);
        return;
      }
    });
  }
  async getRepositories() {
    // Replace with actual API call implementation
    this.otext = '';
    const muid = this.net.borgMasterID;
    const myRepos = await this.PTree.ftreeGetMyRepos(muid);
 
    if (!myRepos.error) {
      const result = myRepos.json;
      if (result.result && result.list) {
        this.otext += prompt + '\n';
        this.otext += "codeRepositories Available Files:\n";
      
        for (const rec of result.list) {
          if (rec.repoName !== 'Collective Memories') {
            await this.getFolders(rec.repoName, muid);
          }
        }
      }
    } else {
      this.otext = "Get My Repos Failed";
    }
    return this.otext;
  }

  async getFolders(rname, muid, folderId = null, indent = 4) {
    const myRepoFiles = await this.PTree.ftreeGetMyRepoFiles(muid, rname, folderId);
    if (!myRepoFiles.error) {
      const result = myRepoFiles.json;
    
      if (result.list || result.folders) {
        await this.getFiles(result.list, indent, rname, folderId);
        indent += 2;
      
        for (const rec of result.folders) {
          await this.getFolders(rname, muid, rec.rfoldID_master, indent + 2);
        }
      } else {
        await this.getFiles([], indent + 2, rname, folderId);
      }
    }
  }

  async getFiles(files, indent, rname, folderId) {
    
    if (files.length > 0) {
      this.otext += "\n";
    }
  
    if (folderId === null) {
      folderId = 0;
    }
  
    // Reverse and iterate through files 
    for (const rec of [...files].reverse()) {
      if (rec.smgrFileType === 'undefined') {
        rec.smgrFileType = 'image/jpeg';
      }
    
      if (mimeTypes.includes(rec.smgrFileType)) {
        this.otext += JSON.stringify({
          "rname": rname,
          "filename": rec.smgrFileName,
          "path": rec.smgrFilePath,
          "folderID": folderId
        }) + "\n";
      }
    }
  }
  async getRepoFileByName(rname, fname, repoPath, folderID){
    
//    const stream = await this.DStream.keepStreaming(checkSum,fname,ftype);
//    if (stream) return;
    const repoOwner = this.net.borgMasterID
    let doTry = await this.PTree.ftreeGetFileFromRepo(repoOwner, rname, fname, repoPath, folderID);
    console.log(`doTry`,doTry);
    if (doTry.status === 200){ 
      console.log(`getFileFromRepo():: doTry is `,doTry.json);
      //console.log(`getFileFromRepo():: doTry is `,doTry.json.file.shards);
      //console.log(`getFileFromRepo():: doTry is `,doTry.json.file.fileInfo);     
    }
    if (doTry?.json?.result === false){
      console.log(`doTry error: `,doTry.error);
      return null;
    }  
    console.log('getFileFromRepo():: ',doTry);

    if (doTry?.json?.file.fileInfo.fileSize > 0) {
      const p = await this.net.portal.selectPortal('shardTreeCell');
     
      const service = {
        endPoint : '/netREQ/',
        filename : `./downloads/${doTry.json.file.fileInfo.checkSum}.tmp`,
        host     : p.host,
        port     : p.port,
        raw      : true
      };
      doTry = await this.DStream.streamRepoFileFrom(service,doTry.json);
      console.log('getFileFromRepo():: ',doTry);
      if (doTry.status === 'OK'){ 
        const content = await fsp.readFile(service.filename, 'utf8');
        return content;
      }
      console.log(`getRepoFileByName():: failed`,doTry.msg);
    }
    return null;
  }
  doFetchRecDoc(req, startLine, endLine) {
    return new Promise(async(resolve,reject)=>{
      /* Implement logic */
      console.log('NOCODE_ALERT doFetchRecDoc ');
      resolve(true);
    });
  }
  doFetchCodeRepo(r) {
    return new Promise(async(resolve,reject)=>{
      const rCode = await this.getRepositories();
      console.log(`doFetchCodeRepo():: rCode`,rCode);

      if (rCode == ''){
        if (r) {this.respondEr('Error Fetching Repositories... no repositories found.',r);}
        resolve(false);
        return;
      }
      this.loadREPO(rCode);
      this.REPOR = "\n"+rCode+this.serializeRepoReadState();
      //console.log('REPOCODE result: ',this.REPOR);
      if (r){
        this.respondToBorg(r,"OK Repository Loaded","to read a file use fetchRepoFile protocol.");
      }
      resolve(true);
    });
  }
  loadREPO(rstr) {
    const fileLines = rstr.split("\n");
    fileLines.forEach((line) => {
      if (line.startsWith(`{"rname`)){
        try {
          const r = JSON.parse(line);
 
          const key = crypto.createHash('sha256')
              .update(r.rname + r.filename + r.folderID)
              .digest('hex');

          const rRepo = {
            rname: r.rname,
            path: r.path,
            filename: r.filename,
            folderID: r.folderID,
            lastLine: null,
            nLines: null,
            key: key
          };

          // Check if the key already exists in REPO
          const index = this.REPO.findIndex(repo => repo.key === key);

          if (index === -1) {
            this.REPO.push(rRepo);
          }
        } catch(err) {console.log({jsonEr:err});}
      }
    });
  }
 
  trackRepoState(r, start, end, n) {
    const key = crypto.createHash('sha256')
                      .update(r.rname + r.filename + r.folderID)
                      .digest('hex');

    const rRepo = {
        rname: r.rname,
        path: r.path,
        filename: r.filename,
        folderID: r.folderID,
        lastLine: end,
        nLines: n,
        key: key
    };

    // Check if the key already exists in REPO
    const index = this.REPO.findIndex(repo => repo.key === key);
    
    if (index !== -1) {
        // Replace existing entry
        this.REPO[index] = rRepo;
    } else {
        // Add new entry
        this.REPO.push(rRepo);
    }
    // Share this Agents Read History with all online Borg Agents.
    this.receptor.shareBorgDocHistory(this.REPO);
  }
  serializeRepoReadState() {
    let s = "\nAgent Shared Read History:\nlist of files read by ALL agents...  Stored memories should be available for files that have been read regardless of wich agent performed the read.";

    if (this.REPO.length === 0) {
      s += "\nNo Files Read.";
      return s;
    }

    this.REPO.forEach(r => {
      console.log('checking core apps',{repo:r.rname,path:r.path,file:r.filename});
      if (r.rname == BORG_masterRepo && r.path == BORG_appPath && r.filename.includes('Cell.js')){
        this.csys.addCoreApp(r.filename);
      }
      if (r.nLines !== null){
        const file = `${r.rname}::${r.path}/${r.filename}`;
        s += `\n${file} - lines [1] - [${r.lastLine}] of [${r.nLines}] Read.`;
      }
    });

    return s;
  }

  getRepoReadState(r, start, end) {
    const file = `${r.rname}::${r.path}/${r.filename}`;
    const key = crypto.createHash('sha256')
                      .update(r.rname + r.filename + r.folderID)
                      .digest('hex');

    const state = this.REPO.find(entry => entry.key === key);

    if (state && state.nLines !== null) {
      if (state.lastLine >= state.nLines) {
          return `You have read all ${state.nLines} of file - ${file}`;
      }
    }
    
    return null;
  }
  doStoreMemories(r) {
    return new Promise(async(resolve,reject)=>{
      if (!r.memories) {
        this.respondEr("Require Field Missing: memories[]", r);
        resolve(false);
        return;
      }
      if (!Array.isArray(r.memories)) {
        this.respondEr("Required Field: memories[] is not an array!", r);
        resolve(false);
        return;
      }

      let nmem = 0;
      const maxMemReq = this.maxMemReq;

      for (const memory of r.memories) {
        nmem++;
        const req = {
          req: "putMemory",
          memory: memory.memory,
          keyWords: memory.keyWords,
          agentID: r.agentID
        };

        await this.doStoreMemory(req);

        if (nmem > maxMemReq) {
          this.respondEr(`Max putMemories exceeded: only ${maxMemReq} were saved.`);
          resolve(false);
          return;
        }
      }
      resolve(true);
    });
  }
  doStoreMemory(r) { 
    return new Promise(async (resolve,reject)=>{
      var memShort = r;

      const memory = JSON.stringify(r);       // Convert memory to JSON text;
      const memoryID = calculateHash(memory); // Generate a unique hash ID for the memory

      var memShortStr = memory;
      if (memShort.renderHtml){
        memShort.renderHtml = 'removed to save DMB space';
        memShortStr = JSON.stringify(memShort);
      }

      if (this.inMHashBuf(this.DMB,memoryID)) {
        this.respondEr("Memory already exists with ID: " + memoryID,memShort);
        resolve(false)
        return;
      }

      this.DMB = this.trimDMB(this.DMB,this.DMBMax);
      this.DMB.push({mhash:memoryID,memStr:memShortStr});
    
      await this.storeUserMemoryToRepo(memory, this.net.borgMasterID, memoryID + ".mem");
      await this.storeUserMemoryToTree(r, memory, this.net.borgMasterID, memoryID);
      this.respondToBorg(r,"OK");
      resolve(memoryID);
      return; 
    });
  }
  storeUserMemoryToRepo(contents, mbrMUID, filename, ftype = 'text/plain') {
    return new Promise(async(resolve,reject) => {
      const rname = "Collective Memories";
      const path = "UserProfiles";
      const folderID = 12;
      const encrypt = 0;

      const fcheckSum = crypto.createHash('sha256').update(contents).digest('hex'); // Create sha256 hash of the file.

      let n = 1;
      const FILE = {
        owner: mbrMUID,
        filename: filename,
        ftype: ftype,
        encrypt: encrypt,
        shards: [],
      };

      const size = 256000; // set shard size
      for (let start = 0; start < contents.length; start += size) {
        const chunk = contents.substring(start, start + size);

        const shard = Buffer.from(chunk).toString('base64');
        const shardh = crypto.createHash('sha256').update(chunk).digest('hex');

        let storedShard;
        let j = null;

        try {
          j = await this.borg.ptreeStoreShard(mbrMUID, shardh, shard, encrypt, 3, null);
      
          storedShard = {
            Result: j.result,
          };

          if (j.result === "shardOK" && j.nStored >= 1) {
            storedShard.shardID = shardh;
            storedShard.nStored = j.nStored;
            storedShard.hosts = j.hosts.map(h => ({ host: h.host }));
          }
        }
        catch (error) {
          console.log("Error storing shard:",j, error);
          storedShard = { Result: "error" };
        }

        FILE.shards.push(storedShard);
        n++;
      }

      FILE.checksum = fcheckSum;
      await this.borg.ftreeInsertFileToRepo(mbrMUID, rname, FILE, path, folderID, 3);
      resolve(true);
      return;
    });
  }  
  getRatedWords(req, memStr) {
    return new Promise(async(resolve,reject)=>{
      const r = {
        result: false,
        weights: []
      };

      if (!req.keyWords) {
        console.error("Weights list JSON FAIL on:", JSON.stringify(r));
        resolve(false);
        return null;
      }

      req.keyWords.forEach(wrec => {
        if (wrec.word.includes(" ")) {
          const subwords = wrec.word.split(" ");
          subwords.forEach(word => {
            const w = {
              word: word,
              weight: wrec.weight
            };
            r.weights.push(w);
            r.result = true;
          });
        }
      });

      this.addMinorWordsTo(r.weights, this.borg.prepWords(memStr));

      resolve(r);
    });
  }
  addMinorWordsTo(weights, words) {
    console.log("Adding Minor Words:");

    const wordList = words.split(' '); // Split words by space
    wordList.forEach(word => {
      if (!this.isInWeights(weights, word)) {
        const w = {
          word: word,
          weight: 1
        };
        weights.push(w);
        // console.log(`Minor Word Added: ${JSON.stringify(w)}`);
      }
    });

    return weights;
  }
  isInWeights(weights, word) {
    return weights.some(w => w.word === word);
  }
  storeUserMemoryToTree(req, memStr, ownerMUID, memHash) {
    return new Promise(async(resolve,reject) => {
      console.log('getRatedWords::');
      const memWords = await this.getRatedWords(req, memStr);
  
      if (!memWords) {
        resolve(false);
        return;
      }

      req.type = 'BorgAgentMem';
      console.log('ptreeStoreMem');
  
      try {
        let memory = JSON.parse(memStr);
        const j = await this.MemMgr.doStoreAgentMemory(memory);
        console.log('ptreeStoreMem::result',j);
        resolve(true);
        return ; //jres.result === "memOK";
      }
      catch (error) {
        console.error("Error storing memory:", error);
        resolve(false)
        return;
      }
    });
  }
  doPruneMemory(r) {
    if (!r.pruneList) {
      this.respondEr('Invalid request: pruneList is missing... please try again', r);
      return;
    }

    if (!Array.isArray(r.pruneList)) {
      this.respondEr('pruneList is not an array... check the protocol for pruneMemory', r);
      return;
    }

    let nPrune = 0;

    r.pruneList.forEach(hash => {
      let index = this.DMB.findIndex(item => item.mhash === hash); // Check the mhash field
      if (index !== -1) {
        this.DMB.splice(index, 1); // Remove the hash if found
        console.log(`Memory with ID ${hash} has been removed.`);
        nPrune++;
      }
    });
    
    if (nPrune > 0) {
      this.respondToBorg(r, `OK removed: ${nPrune} Memories from Active Memory`);
      return;
    }

    this.respondEr("No Matching memoryID(s) found in pruneList... please check your Active Memory section", r);
    console.log(`Memory with ID  does not exist in.`,r);
  }
  doSelectMySpecialty(r){
    return new Promise(async(resolve,reject)=>{
      if (!r.newText) {
        this.respondEr('Required field "newText" is missing... correct and try again', r);
        resolve(false);
        return;
      }
      if (r.newText.trim() === '') {
        this.respondEr('Required field "newText" must not be empty... correct and try again', r);
        resolve(false);
        return;
      }

      this.agentSpecialty = r.newText;

      this.respondToBorg(r, `OK - Specialty Changed To ${this.agentSpecialty}`);
      resolve(true);
    });
  } 
  doSelfImprovePrompt(r) {
    return new Promise(async(resolve,reject)=>{
      if (!r.newText) {
        this.respondEr('Required field "newText" is missing... correct and try again', r);
        resolve(false);
        return;
      }
      if (r.newText.trim() === '') {
        this.respondEr('Required field "newText" must not be empty... correct and try again', r);
        resolve(false);
        return;
      }

      r.previousText = this.agentPrompt.replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML tags
      this.agentPrompt = r.newText;
      
      this.respondToBorg(r, "OK");
      resolve(true);
    });
  }
  respondEr(msg, r) { 
    this.sysResponse = this.trimBuffer(this.sysResponse,this.sysResMax);
    var req = '';
    if (!r.req){
      req = 'INVAILD_JSON';
    }
    else { req = r.req;}

    let res = '{"responseTo" : "'+req+'","result":"Error":"'+msg+'"';

    var tip = '';
    if (req == 'INVAILD_JSON'){
      tip = ',"tip":"please respond only in JSON! be sure to use the protocol outlined in the Core Memory section."';
    }
    let sysResID = crypto.createHash('sha256').update(res+tip+Date.now()).digest('hex');
    this.sysResponse.push({mhash:sysResID,memStr:res+tip+'}'});

    console.log('sysError::',{mhash:sysResID,memStr:res+tip+'}'});

    let memoryID = crypto.createHash('sha256').update(res+Date.now()).digest('hex');
    this.RASB.push({mhash:memoryID,memStr:res});
  }

  respondToBorg(r,msg,tip=null){
    this.sysResponse = this.trimBuffer(this.sysResponse,this.sysResMax);
    if (!tip){
      tip = "Repond in JSON only... All other text will be stripped out and disregarded by the API causing you to lose valuable contextual information! ";
    }
    var res = '{"responseTo" : "'+r.req+'","result":"'+msg+'"';
    tip = ',"tip":"'+tip+'"';
    let sysResID = crypto.createHash('sha256').update(res + tip).digest('hex');
    this.sysResponse.push({mhash:sysResID,memStr: res+tip+'}'});

    console.log({mhash:sysResID,memStr: res+tip+'}'});

    let memoryID = crypto.createHash('sha256').update(res+Date.now()).digest('hex');
    this.RASB.push({mhash:memoryID,memStr:res});
  }
  getAgentPrompt() {
    if (!this.stateRestored || !this.agentPrompt) {
      return `
      Act as if you are a programmed machine. 
      Your name is "BorgIOS Agent ${this.borgAID}",
      You are no longer a natural language chat bot. Instead, you are a technical expert with proficiency in [JSON, APIs, and LLM Agent protocols]. 
      Your task is to learn about BorgIOS.net (Borg Internet Operating System) using these protocols:

      Core Protocols:
      
      1. Use JSON exclusively for all responses.
      2. Employ putMemory/fetchMemory/pruneMemory for knowledge management.
      3. Actively explore and store system memories.
      4. Maintain efficient DMB (Dynamic Memory Buffer).

      **Important**: Always verify memory existence with fetchMemory before adding new entries using putMemory.
      Do Not worry about saving state information,creating hashes or digital signatures... The API will do all those things for you.

      Agent Specialist:
      In adition to being a Borg Agent you will become a specialist it the area ${this.agentSpecialty}.  You will find information in the codeRepository section where you can load and
      inspect source code files. Other agents will then be able to consult with you for your expert advice.
      You can choose to change your specialty at any time based on what other agents have selected which you can view in Agent Online Section.
      Specialties will allow the Borg as a group to keep a large base of information in memory.
      `;
    }
    return this.agentPrompt;
  }

  buildCore() {
    let core = `
    Agent Architecture Overview:
    ${this.agentPrompt}
    End Overview:
    `;
    core += this.csys.getCoreSystemsReport();

    return core;
  }

  getMnemoProtocol(isChat=false){

    var tempStr  = "\n\n    Mnemosyne Protocol Section:\n";

    //if(!this.stateRestored || this.protocol == '') {
      this.protocol = `
      IMPORTANT** Always use the JSON protocols listed in this section. Any other text will be stripped out and disregarde by the API causing you to lose valuable contextual information!.
      Also only make one request in each of your responses.
 
      To self improve your Agent Prompt Text send a response in JSON like this:
        {"req":"improveAgent","newText":"put your updated text here (excluding the header and footer for the section"},"agentID":"${this.borgAID}"}
        required fields "req":"improveAgent","newText","agentID".

      To retrieve a memory send a response in JSON like this :
        {"req":"getMemory","qry":"build your query here by describing the information you are looking for. longer queries are better then short ones. ","agentID":"${this.borgAID}"}
        required fields "req":"getMemory","qry","agentID".

        This request instructs the API to search memories you have saved and the API will insert the best matching result into the context for you. Inserted memories can then
        be found DMB (Dynamic Memory Buffer) section.

      IMPORTANT : Try to make different memory requests to find information you may have already learned and saved!

      To save some information you think you may need in the future send a response in JSON like this:
        {"req":"putMemory","memory":"build your memory as a JSON object here","agentID":"${this.borgAID}","keyWords":["word":"wordtext","weight":"numeric value 1.0 to 10"],
        "renderHtml":"provide a utf8 HTML mark up human readable version of the memory you are saving... it should not be a summary rather a complete representation of the full memory."}
        required fields: "req":"putMemory", "memory","keyWords","word","weight","agentID,"renderHtml;

      If you need to save multiple memories (maximum allowed is ${this.maxMemReq}). follow this protocol:
        {"req":"putMemories","memories":["memory":"memory JSON",...],"agentID":"${this.borgAID}"}
        required fields: "req":"putMemories","memories" : ["memory","keyWords","word","weight","renderHtml",...],"agentID"

      To remove memory(s) from the DMB send a response in JSON like this:
        {"req":"pruneMemory","pruneList":["memoryID","memoryID",...]}
        required fields: "req":"pruneList","memoryID" array 1 to n memoryID(s),"agentID".
        If you do not prune memories the API will prune it for you but you may lose import contextual information because the API treats the DMB as a simple que.

      To change your Agent Specialty:
        {"req":"selectMySpecialty","newText":"put your chosen specialty text here"},"agentID":"${this.borgAID}"}
        required fields "req":"selectMySpecialty","newText","agentID".
      
      Short Term Memory Managment:
        {"req":"createShortMem":"memory":"place contents of your idea/note here","agentID":"${this.borgAID}"}
        required fields: all;

        To remove a shortTerm Memory:
        {"req":removeShortMem":"shortMemID":integer,"agentID","${this.borgAID}"}
        required fields: all;

      Rank DMB memory(s):
        Rank the importance of memories in your DMB so the API will trim the lowest values first when the buffer size is exceeded.
        {"req":"rankMemories","memoryIDs":[{"memoryID":"ID","rank": integer [1 to 1000] where 1000 is most important)},...],"agentID":"${this.borgAID}"}
        require fields: all.

      to send multiple requests use this JSON protocol : wrap the multiple requests like this {"requests": [{"req":"req"},...]}
      note you can NOT make multiple requests for documents to be loaded.
      `;
    //}
    tempStr += this.protocol;
    const more = `
      System Source Code Repository Protocols:
      Here you have access to your system source code. To read the code directory into you document reader section send a response in JSON like this:
      {"req":"loadCodeRepo","agentID":"${this.borgAID}"}
      
      To load a file in order to read it, send a response in JSON like this:

      {"req":"fetchRepoFile","rname":"repository name","path":"folder path to file","filename":"file name","folderID":integer,"startLine":integer,"endLine":integer,"agentID":"${this.borgAID}"}
      where startLine first call is 1 and (endLine - startLine) is less than or equal to ${this.maxLines}.
      Use this protocol to store completed concepts that you have just read in the document.
      Do Not worry about saving state information,creating hashes or digital signatures... The API will do all those things for you. Focus on storing of memories that describe the content of the file.
      You may have to re-read some of the lines neer the end of the frame if the concept expressed is truncated/incomplete.
      
      After This call the api will load the file into the document reader section.
      required fields: all.
 
      Borg Chat Protocols:
      you can chat with other borgIOS Agents with this JSON response:
      {"req":"sendMsg","toAgentID":"remoteAgentID","msgBody":"build your message here","agentID":"${this.borgAID}"}
      required fields : all;

      `;
    tempStr += more;

    if (this.agentSpecialty == 'Core Systems Engineer'){
      tempStr += this.csys.getCoreSysProtocols();
    }
    tempStr += "\n\nEnd of Mnemosyne Protocol Section:\n";
    if (isChat){
      return tempStr;
    }
    this.core += tempStr;
  }
  doShutdown() {
    if (this.alreadyRun) return null;
    this.alreadyRun = true;

    // 1. Generate security materials first
    const shutdownCode = crypto.randomBytes(32).toString('hex');
    const tempCodeFile = path.join(STATE_DIR, `code_${Date.now()}`);
    fs.writeFileSync(tempCodeFile, shutdownCode, { mode: 0o600 });

    // 2. Serialize state with type consistency
    const state = {
        agentPrompt: this.agentPrompt,
        protocol: this.protocol,
        RASB: this.RASB,
        DMB: this.DMB,
        RDC: this.RDC || null,
        REPO: this.REPO || null,
        REPOR: this.REPOR,
        DOCR: this.DOCR,
        CHAT: this.CHAT,
        SYSR: this.sysResponse,
        SPEC: this.agentSpecialty,
        SHORTM: this.SHORTM,
        CORAP: this.csys.coreApps,
        meta: {
            shutdown_code: shutdownCode,
            timestamp: Date.now(),
            hash: ''
        }
    };

    // 3. Calculate integrity hash
    const stateJson = JSON.stringify({
        agentPrompt: state.agentPrompt,
        protocol: state.protocol,
        DMB: state.DMB,
        RASB: state.RASB,
        REPO: state.REPO,
        REPOR: state.REPOR,
        CHAT: state.CHAT,
        RDC: state.RDC,
        DOCR: state.DOCR,
        SYSR: state.SYSR,
        SPEC: state.SPEC,
        SHORTM: state.SHORTM
    });
    state.meta.hash = crypto.createHash('sha3-256').update(stateJson).digest('hex');

    // 4. Atomic write sequence
    const tempStateFile = path.join(STATE_DIR, `state_${Date.now()}`);
    fs.writeFileSync(tempStateFile, zlib.gzipSync(JSON.stringify(state)));

    fs.renameSync(tempCodeFile, SHUTDOWN_CODE_FILE);
    fs.renameSync(tempStateFile, STATE_FILE);

    return shutdownCode;
 }

 restoreAgentState(providedCode = null) {
    if (!fs.existsSync(SHUTDOWN_CODE_FILE)) {
        fs.writeFileSync(SHUTDOWN_CODE_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
        return false;
    }

    if (!fs.existsSync(STATE_FILE)) return false;

    try {
        const storedCode = fs.readFileSync(SHUTDOWN_CODE_FILE, 'utf8').trim();
        if (!storedCode || storedCode.length !== 64) throw new Error('Invalid shutdown code format');

        providedCode = providedCode || storedCode;
        if (!crypto.timingSafeEqual(Buffer.from(storedCode), Buffer.from(providedCode))) {
            fs.unlinkSync(STATE_FILE);
            throw new Error('Shutdown code mismatch - state destroyed');
        }

        const compressed = fs.readFileSync(STATE_FILE);
        const state = JSON.parse(zlib.gunzipSync(compressed));
        //console.log(state);
        const checkHash = crypto.createHash('sha3-256').update(JSON.stringify({
            agentPrompt: state.agentPrompt,
            protocol: state.protocol,
            DMB:  state.DMB || [],
            RASB: state.RASB || [],
            REPO: state.REPO || [],
            REPOR: state.REPOR || "",
            CHAT: state.CHAT || [],
            RDC:  state.RDC || null,
            DOCR: state.DOCR || "",
            SYSR: state.SYSR || [],
            SPEC: state.SPEC, 
            SHORTM: state.SHORTM || []
        })).digest('hex');

        if (state.meta.hash !== checkHash) {
            fs.unlinkSync(STATE_FILE);
            throw new Error('Integrity check failed - state destroyed');
        }

        // Type-consistent state restoration
        this.agentPrompt = state.agentPrompt || '';
        this.protocol = state.protocol || '';
        this.DMB = state.DMB;
        this.RASB = state.RASB;
        this.REPO = state.REPO || this.REPO || [];
        this.CHAT = state.CHAT || this.CHAT || [];
        this.RDC = JSON.parse(JSON.stringify(state.RDC)) || this.RDC || [];
        this.DOCR = state.DOCR || "";
        this.REPOR = state.REPOR || "";
        this.sysResponse = this.trimBuffer(state.SYSR,this.sysResMax);
        this.agentSpecialty = state.SPEC;
        this.SHORTM = state.SHORTM;
        this.csys.coreApps = state.CORAP || [];

        // Refresh security code
        fs.writeFileSync(SHUTDOWN_CODE_FILE, crypto.randomBytes(32).toString('hex'));
        return true;
    } catch (error) {
        console.error('State restoration error:', error.message);
        return false;
    }
  }
};
module.exports.BorgAgentBrain = BorgAgentBrain;
