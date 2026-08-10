/*
* Distributed Chat Organism
*/

const PtreeReceptor    = require('./ptreeReceptorObj');
const PtreeWebSoc      = require('./ptreeWebSocObj');
const {MkyWebConsole}  = require('./networkWebConsole.js');

const db            = require('./bchatDB');
const crypto        = require('crypto');

// -----------------------------------------------------
// Manages Individual chat memories
// -----------------------------------------------------
class chatMemoriesObj {
  constructor(peerTree){
    this.net = peerTree;
    this.memoryID  = null;
    this.memTime   = null;
    this.memTitle  = null;
    this.chats     = [];
  }
}
// --------------------------------------------------------------------------------------
// Manages A Single Channels History...  
// --------------------------------------------------------------------------------------
class channelObj {
  constructor(peerTree){
    this.cell  = peerTree;
    this.ID    = null;
    this.title = null;
    this.desc  = null;
    this.chats = [];
    this.users = [];
    this.memories = new Map;  // Chat History Log a collection of chatMemoriesObj
  }
  pushNewMsg(ownMUID,msg){
    const chat = {
      from : ownMUID,
      text : msg.content,
      time : msg.serverReceived
    }
    this.chats.push(chat);
    console.log(`pushNewMsg():: `,msg,this.chats);
    this.users.forEach( (user) => {
      if (user !== ownMUID){
        this.net.websoc.sendNewMsg(user,chat);
      }
    });
    this.cell.pushOutNewChat(ownMUID,msg);
  }
}
// ------------------------------------------------------------
// Manages the current Nodes active chat channels
// ------------------------------------------------------------
class channelMgr {
  constructor(peerTree){
    this.cell = peerTree;
    this.websoc = peerTree.websoc;
    this.liveChannels = new Map();  // Active Channels Open On this node.
    const bl = this.getBorgLounge();
    this.liveChannels.set(bl.roomId,bl.lounge);
    console.log(`live channels:`,this.liveChannels);
  }
  async pushNewMsg(ownMUID,msg){
    console.log(`pushNewMsg(ownMUID,msg):: `,this.liveChannels);
    let channel = this.liveChannels.get(msg.roomId);
    if (!channel){
      channel = this.getColdChannelById(msg.roomId);
    }
    if (channel) channel.pushNewMsg(ownMUID,msg);
    else console.log(`pushNewMsg(ownMUID,msg):: channel not found `);
  }
  getColdChannelById(roomId){
    console.log(`getColdChannelById(msg.roomId):: `,roomId)
    return null;
  }
  getBorgLounge(){
    let lounge = new channelObj(this.cell);
    const randomIndex = Math.floor(Math.random() * this.websoc.loungeHosts.length);
    console.log(`getBorgLounge():: randomIndex`,randomIndex);

    lounge.ID     = this.cell.net.borgMasterID;
    //lounge.hostIP = this.websoc.loungeHosts[randomIndex].reply.remIp;
    lounge.title  = 'Borg Space Lounge';
    lounge.desc   = 'Relax and enjoy the space.';
    lounge.ownID  = this.cell.net.borgMasterID;

    console.log(`getBorgLounge():: `,lounge);

    return {roomId:lounge.ID,lounge}
  }
}
class ChatOrganismObj {
  constructor(peerTree, reset) {
    this.chatLog = [];   // distributed chat history
    this.reset        = reset;
    this.isRoot       = null;
    this.status       = 'starting';
    this.net          = peerTree;
    this.db           = db.getConnection();
    this.receptor     = null;
    this.websoc       = null;
    this.net.DStream.attachCell(this); // Attach network binary transport.
    this.wcon         = new MkyWebConsole(this.net,null,this, process.title);
  }
  attachReceptor(inReceptor,websoc){
    this.receptor = inReceptor;
    this.websoc   = websoc;
  }

  // ---------------------------------------------------------
  // Broadcast a chat message to all nodes
  // ---------------------------------------------------------
  pushOutNewChat(muid,msg){
    console.log(`pushOutNewChat(muid,msg):: pushing new msg`,muid,msg);  
  }
  sendChatMessage(username, text) {
    const msg = {
      username,
      text,
      timestamp: Date.now()
    };

    // Add locally
    this.chatLog.push(msg);

    // Broadcast to organism
    this.net.broadcast({
      req: 'chatMsgBCast',
      data: msg
    });
  }

  // ---------------------------------------------------------
  // Handle incoming broadcast chat messages
  // ---------------------------------------------------------
  async handleBCast(j) {
    //console.log('handleBCast():: ',j);
    if (j.remIp == this.net.nIp) {
      //console.log('ignoring bcast to self',this.net.nIp);
      return;
    }
    if (j.msg.req){
      if (j.msg.req == 'sendNodeList'){
        this.doPow(j.msg,j.remIp);
        return;
      }
      if (j.msg.req == 'stopNodeGenIP'){
        this.doPowStop(j.remIp);
        return;
      }
      if (j.msg.req === 'chatMsgBCast') {
        this.chatLog.push(j.data);
        return;
      }
      if (j.msg.req === 'getMasterChannel'){
        await this.doGetMasterChannel(j.remIp,j.msg);
        return;
      }
    }
  }
  handleReply(r){
    if (r.req == 'doSomthingExample'){
      //do somestuff an pass result back to receptor
      //this.receptor.processResponse(r);
      return;
    }
  }
  handleXhrError(j){
    if (!j.msg)
      return;
    const msg = j.msg;
  }
  // ---------------------------------------------------------
  // RPC: direct message to a specific node
  // ---------------------------------------------------------
  async sendDirectMessage(toIp, username, text) {
    const msg = {
      req: 'directChatReq',
      response: 'directChatResult',
      data: { username, text }
    };

    let reply = await this.net.reqReply.waitForReply(toIp, msg);

    if (reply.result === "OK") {
      return reply.jsonResData;
    }

    return reply.result;
  }

  // ---------------------------------------------------------
  // Handler: respond to directChatReq
  // ---------------------------------------------------------
  handleDirectChatReq(j) {
    const { username, text } = j.data;

    const entry = {
      username,
      text,
      timestamp: Date.now(),
      direct: true
    };

    this.chatLog.push(entry);

    const reply = {
      reqId: j.reqId,
      response: 'directChatResult',
      result: 'OK',
      jsonResData: { received: true }
    };

    this.net.sendReply(j.remIp, reply);
  }

  // ---------------------------------------------------------
  // Cell request handler
  // ---------------------------------------------------------
  async handleReq(remIp, j) {
    console.log(`handleReq():: `,remIp,j);
    if (j.req === 'directChatReq') {
      this.handleDirectChatReq(j);
      return true;
    }
    if (j.req === 'storeNewChannel'){
      this.doStoreNewChannel(j);
      return true;
    }
    return false;
  }
  async cellCreateBorgChannel(j){
    let found = await this.checkForBorgMasterChannel();
    console.log(`cellCreateBorgChannel():: found`,found);
    if (found === false || found === null ){
      j.isBorgChatMaster = true;
    }
    j.ccMasterID = this.net.calculateHash(JSON.stringify(j));

    if (j.isBorgChatMaster) {
      j.ccMasterID = this.net.borgMasterID;
    }

    j.newChanDate = new Date(Date.now()).toISOString().slice(0, 19).replace('T', ' ');

    var IPs = await this.receptorReqNodeList(j,[]);
    console.log(`cellCreateBorgChannel():: IPs`, IPs);
    const startT  = Date.now();
    let result    = {};
    const results = [];
    const hosts   = [];

    IPs.forEach((IP) => {
      this.reqDoStoreNewChannel(j,IP)
     .then((r) => {
        var rcon = { qres: r, IP: IP };
        results.push(rcon);
      })
      .catch((e) => {
         console.log('channel storage failed', e);
      });
    });

    //console.log('Waiting For Peer Responses');

    // Check All Response for success or failure;
    var trys = 0;
    var nStored = 0;
    var newChanID = null;
    
    const id = setInterval(() => {
      console.log(`Results[]:: `,results);
      if (results.length == IPs.length){
        clearInterval(id);
        for (var r of results) {
          if (r.qres) {
            nStored++;
            hosts.push({host:r.qres.remMUID,ip:r.qres.remIp});
            newChanID = r.newChanID;
            
          }
        }
        console.log('New Channel Stored::TotalTime',Date.now() - startT,'chanID: ',chanID,'nStored::',nStored);
        result = {result:"chanOK",nStored: nStored,msg:"Channel Created",chanID:newChanID,hosts: hosts};

      }
      trys++;
      if (trys > 25) {
        clearInterval(id);
        //console.log('Interval stopped.',results);
        result = {result:"FAILED",nStored:nStored,chanID:newChanID,hosts:hosts};
      }
    }, 300);

    return result;
  }
  async checkForBorgMasterChannel(){
    let BCast = {
      req      : 'getMasterChannel',
      response : 'getMasterChannelResult'
    }
    let doTry = await this.net.bcastMgr.getReplies(BCast);

    console.log(`checkForBorgMasterChannel():: `,doTry);
    if (Array.isArray(doTry) && doTry.length === 0) {
      return doTry;
    }
    if (doTry.result === 'NOBODY') {
      return null;
    }
    return false;
  }
  async doGetMasterChannel(remIp,j){
    const reply = {
      response : 'getMasterChannelResult',
      reqId    : j.reqId,
      result   : 'OK'
    }
    const SQL = 'Select count(*) nRec from `bchat`.`tblChatChan` where ccMasterID = ?';
    const params = [this.net.borgMasterID];
    console.log(`doGetMasterChannel():: `,SQL,params);
    let nRec = await new Promise((resolve, reject) => {
      this.db.query(SQL, params, (err, result) => {
        if (err) {
          resolve(null);
          return;
        }
        console.log(result);
        resolve(result[0].nRec);
      });
    });
    // reply only if found.
    console.log(`nRec:: is`,nRec);
    if (nRec){
      console.log(`sending reply`,remIp,reply);
      reply.result = 'OK';
      this.net.sendReply(remIp, reply);
    }
  }
  async reqDoStoreNewChannel(j,ip) {
    const msg = {
      req      : 'storeNewChannel',
      response : 'storeNewChannelResult',
      chan     : j
    }
    let doTry = await this.net.reqReply.waitForReply(ip, msg);
    console.log(`reqDoStoreNewChannel():: doTry`,doTry);
    if (doTry.result === 'OK') {
      return doTry.newChanId;
    }
    return null;
  } 
  async doStoreNewChannel(j){
    const reply = {
      reponse   : 'storeNewChannelResult',
      reqId     : j.reqId,
      result    : 'OK',
      newChanId : null
    }
    const SQL = 'INSERT into `bchat`.`tblChatChan` (ccMasterID,ccOwnID,ccTopic,ccDate,ccDescription) values (?,?,?,?,?) ';
    const params = [j.chan.ccMasterID,j.chan.data.ownMUID,j.chan.data.title.substring(0, 84),j.chan.newChanDate,j.chan.data.desc];
    reply.newChanId = await new Promise((resolve, reject) => {
      this.db.query(SQL, params, (err, result) => {
        if (err) {
          resolve(null);
          reply.result = 'DB_FAIL';
          return;
        }
        resolve(j.chan.ccMasterID);
      });
    });
    console.log(`doStoreNewChannel():: reply`,reply);
    this.net.sendReply(j.remIp, reply);    
 }
  receptorReqStopIPGen(work){
    var req = {
      req : 'stopNodeGenIP',
      work  : work
    }
    this.net.broadcast(req);
  }
  receptorReqNodeList(j,excludeIps=[],ncopies=3){
    return new Promise( (resolve,reject)=>{
      var mkyReply = null;
      const maxIP = ncopies;
      var   IPs = [];
      const gtime = setTimeout( ()=>{
       //console.log('Send Node List Request Timeout:');
        this.net.removeListener('mkyReply', mkyReply);
        resolve(IPs);
      },7*1000);

      var req = {
        req    : 'sendNodeList',
        nodes  : maxIP,
        xnodes : excludeIps,
        work   : crypto.randomBytes(20).toString('hex')
      }

      this.net.broadcast(req);
      this.net.on('mkyReply', mkyReply = (r)=>{
        if (r.req == 'pNodeListGenIP'){
          //console.log('mkyReply NodeGen is:',r);
          if (IPs.length < maxIP  && !IPs.includes(r.remIp)){
            IPs.push(r.remIp);
          }
          else {
            this.receptorReqStopIPGen(req.work);
            clearTimeout(gtime);
            this.net.removeListener('mkyReply', mkyReply);
            resolve(IPs);
          }
        }
      });
    });
  }
  doPowStop(remIp){
    console.log(`doPowStop():: `,remIp);
    this.net.gpow.doStop(remIp);
  }
  doPow(j,remIp){
    console.log(`doPow():: `,remIp);
    if (j.xnodes.includes(this.net.nIp)){
      return;
    }
    this.net.gpow.doPow(2,j.work,remIp);
  }
}

class ChatOrganismWebSoc extends PtreeWebSoc {
  constructor(peerTree,port){
    super(peerTree, port);
    this.cell = peerTree;
    this.rooms = null;
  }
  async init(){
    let found = await this.cell.checkForBorgMasterChannel();
    if (Array.isArray(found)) {
      this.loungeHosts = found;
      console.log(`websoc.init():: found`,found);
      this.rooms = null; //new channelMgr(this.cell);
      return
    }
    this.loungeHosts = [];
  }
  async handleWSNewUser(borgToken){
    console.log(`handleWSNewUser():: `,borgToken);
    await this.init();
    if (this.rooms === null)
      this.rooms = new channelMgr(this.cell);
    
    //this.rooms.addUser(borgToken);
    const msg = {
      type: 'openBorgChannel',
      chan: {
        chanID    : this.cell.net.borgMasterID,
        title     : 'Borg Space Lounge',
        chanState : {},
      },
      timestamp: Date.now()
    } 
    this.sendToAddress(borgToken.Address, msg);
  }
  sendNewMsg(user,chat){
    console.log(`sendNewMsg(user,chat):: `,user,chat);
  }
  async handleWSMessage(msg, ws, clientId, identity) {
    // Prepare the response with additional data
    const responseMsg = {
      ...msg,
      serverReceived: Date.now(),
      handledBy: this.constructor.name,
      json : {},
      status: 'processed'
    };
    console.log(`handleWSMessage():: `,responseMsg,clientId,identity);

    switch (msg.req) {
      case 'createBorgChannel':
        responseMsg.json = await this.doCreateBorgChannel(msg);
        break;
    }
    switch (msg.type) {
      case 'chat':
        await this.rooms.pushNewMsg(identity.Address,responseMsg);
        responseMsg.json = {chat: 'OK'}; 
        break;

      default:
        responseMsg.json = {error: true,msg: 'No Handler Found For Request'};
    } 
    // Send the enhanced response using parent logic
    super.handleWSMessage(responseMsg, ws, clientId, identity);
  }
  async doCreateBorgChannel(msg){
    msg.data.ownMUID = msg.borgToken.Address;
    console.log(`doCreateBorgChannel():: starting`,msg);
    let doTry = await this.cell.cellCreateBorgChannel(msg);
    console.log(`doCreateBorgChannel():: doTry`,doTry);
    return {error:true,msg: 'doCreateBorgChannel method incomplete'};
  }  
}

// ---------------------------------------------------------
// Receptor: expose /send and /messages
// ---------------------------------------------------------
class ChatOrganismReceptor extends PtreeReceptor {
  constructor(peerTree, port) {
    super(peerTree, port);
    this.organism = peerTree;
  }

  async handleReq(j, res) {
    switch (j.msg.req) {
      case 'send':
        return this.handleSend(j.msg, res);

      case 'messages':
        return this.handleMessages(res);

      case "chatOrganismUI":
        return this.handleRenderUI(j.msg.parms,res);

      case "chatSend":
        return this.handleSend(j.msg.parms.message,res);

      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Unknown request' }));
    }
  }
  makeJsID() {
    return "js_" + crypto.randomUUID();
  }
  // POST /send { username, text }
  handleRenderUI(msg,res){
    const jsID = this.makeJsID();

    const result = {
     ok : true,	  
     action: "chatOrganismUI",
     res: "serviceView",
     html: `
     <div class="chatWindow" style="border:1px solid #444;padding:10px;border-radius:6px;width:100%;max-width:600px;">
      <h2>Chat Organism</h2>

      <div id="chatMessages" class="chatMessages"
           style="height:250px;overflow-y:auto;border:1px solid #333;padding:6px;background:#111;color:#eee;">
      </div>

      <div style="margin-top:10px;display:flex;gap:6px;">
        <input id="chatInput"
               type="text"
               placeholder="Say something..."
               style="flex:1;padding:6px;border-radius:4px;border:1px solid #555;background:#222;color:#eee;">
        <button onclick="sendChatMessage()"
                style="padding:6px 12px;border-radius:4px;background:#4a8;border:none;color:#000;">
          Send
        </button>
      </div>
     </div>
    `,
    js: `
    function sendChatMessage(){
      const msg = document.getElementById("chatInput").value;
      if (!msg) return;

      sendRequest({
        req: "chatSend",
        parms: { message: msg }
      });

      document.getElementById("chatInput").value = "";
    }

    function chatOrganismUpdate(j){
      const box = document.getElementById("chatMessages");
      if (!box) return;

      box.innerHTML += "<div>" + j.sender + ": " + j.text + "</div>";
      box.scrollTop = box.scrollHeight;
    }
    `,
    jsID
    };
    res.writeHead(200);
    res.end(JSON.stringify(result));
  }	  
  handleSend(msg, res) {
    const { username, text } = msg.data;

    this.organism.sendChatMessage(username, text);

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
  }

  // POST /messages
  handleMessages(res) {
    res.writeHead(200);
    res.end(JSON.stringify(this.organism.chatLog, null, 2));
  }
}

module.exports.ChatOrganismObj      = ChatOrganismObj;
module.exports.ChatOrganismReceptor = ChatOrganismReceptor;
module.exports.ChatOrganismWebSoc   = ChatOrganismWebSoc;
