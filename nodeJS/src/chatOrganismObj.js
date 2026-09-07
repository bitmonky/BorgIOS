/*
* Distributed Chat Organism
*/

const PtreeReceptor       = require('./ptreeReceptorObj');
const PtreeWebSoc         = require('./ptreeWebSocObj');
const {MkyWebConsole}     = require('./networkWebConsole.js');
const {BorgIOSptreeAPI}   = require("./borgIOSptreeAPI.js");

const db            = require('./bchatDB');
const crypto        = require('crypto');
const borgMaxChats  = 100;

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
    this.users = new Set();
    this.memories = new Map;  // Chat History Log a collection of chatMemoriesObj
  }
  pushNewMsg(ownMUID,msg){
    const chat = {
      from : ownMUID,
      text : msg.content,
      time : msg.serverReceived
    }
    this.chats.push(chat);
    console.log(`pushNewMsg(ownMUID,msg):: `,this.cell.websoc.loungeHosts,this.cell.net.rnet.myIp);
 
    // Distribute new msg 

    // 1. Persist New Chat To Database.
    if (msg?.isBCast !== true){
      this.cell.websoc.loungeHosts.forEach((host)=>{
        console.log(`pushNewMsg(ownMUID,msg):: persist to`, host);
        this.cell.writeNewChatToChanLog(host.remIp,this.ID,chat);
      });
    }

    console.log(`pushNewMsg():: `,msg,this.chats,this.users);
    // 2. push message to connected clients.
    this.users.forEach( (user) => {
      if (user !== ownMUID ){
        this.cell.websoc.sendNewMsg(this.ID,user,chat);
      }
    });
    
    // 3. push out to other hotNodes for the channel.
    msg.chanID = this.ID;
    msg.ownMUID = ownMUID;
    if (msg?.isBCast !== true){
      msg.isBCast = true;
      this.cell.pushOutNewChat(ownMUID,msg);
    }
  }
  pushToClientsNewUser(newUserID,profile)  {
    console.log(` pushToClientsNewUser(newUserID,profile):: starts here:`,newUserID,profile);
    const msg = {
      type         : 'borgUserJoined',
      user : {
        newUserID    : newUserID,
        profile      : profile
      }
    }
    this.users.forEach( (user) => {
      if (user !== newUserID ){
        this.cell.websoc.sendToAddress(user, msg);
      }
    });
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
  addUser(userMUID,chanID){
    const channel = this.liveChannels.get(chanID);
    channel.users.add(userMUID);
    const profile = this.cell.activeUsers.get(userMUID);
   
    console.log(`addUser(userMUID,chanID):: `,channel.users);    

    // push out new user joinned to network.

    if (chanID === this.cell.net.borgMasterID){
      this.websoc.hotNodes.forEach(( node) => {
        if (node.remIp !== this.cell.net.rnet.myIp){
          this.cell.doNodePushOutNewUser(node.remIp,chanID,userMUID,profile);
        }
      });
    }
    channel.pushToClientsNewUser(userMUID,profile);
  }
  getUserProfiles(users){
    const ups = [];
    users.forEach( (userId) =>{
      const profile = this.cell.activeUsers.get(userId);
      ups.push(profile); 
    });
    return ups;
  }
  async getChanState(chanID,hosts){
    const channel = this.liveChannels.get(chanID);
    console.log(`getChanState(chanID):: channel`,channel,hosts);
    if (channel.chats.length === 0) {
      channel.chats = await this.cell.doReadChanChatDB(chanID,hosts);
    }
    let state = {
      chanID : chanID,
      users  : this.getUserProfiles(channel.users),
      chats  : channel.chats,
      title  : channel.title,
      desc   : channel.desc
    }
    return state;
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

    return {roomId:lounge.ID,lounge}
  }
}
class ChatOrganismObj {
  constructor(peerTree, reset) {
    this.PTree        = new BorgIOSptreeAPI(peerTree);
    this.activeUsers  = new Map(); 
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
    const pmsg = {
      req : 'pushOutNewChat',
      msg : msg
    }
    console.log(`pushOutNewChat(muid,msg):: pushing new msg`,muid,msg);  
    // pass message to the other hotNodes for distribution 

    this.websoc.hotNodes.forEach( (node) => {
      if (node.remIp !== this.net.rnet.myIp) {
        this.net.sendMsg(node.remIp,msg);
      }
    });
  }
  doNodePushOutNewUser(remIp,chanID,userId,profile){
    const msg = {
      req     : 'pushNewUserToClients',    
      chanId  : chanId,
      userId  : userId,
      profile : profile
    }
    this.net.sendMsg(remIp,msg);
  }
  async doReadChanChatDB(chanID,hosts){
    if (hosts.length === 0) return [];

    let msg = {
      req      : 'sendChatsLog',
      response : 'sendChatsLogResult',
      chanId   : chanID
    }

    const randomIndex = Math.floor(Math.random() * hosts.length);
    let doTry = await this.net.reqReply.waitForReply(hosts[randomIndex].remIp, msg); 
    console.log(`doReadChanChatDB():: doTry is `,doTry);
    if (doTry.result === 'OK'){
      return doTry.chats;
    }
    return [];
  }
  async doSendChatsLog(remIp,j){
    let reply = {
      response : 'sendChatsLogResult',
      reqId    : j.reqId,
      result   : 'OK',
      chats    : []
    }
    const SQL = 'SELECT csFrom as `from`,csText as `text` ,csTime as `time` from `bchat`.`tblChanState` where csCCMasterID = ? order by csTime limit ?';
    const params = [j.chanId,borgMaxChats];
    reply.chats = await new Promise((resolve, reject) => {
      this.db.query(SQL, params, (err, result) => {
        if (err) {
          resolve([]);
          console.log(`doSendChatsLog(remIp,j):: `,SQL,params,err);
          reply.result = 'DB_FAIL';
          return;
        }
        resolve(result);
      });
    });
    console.log(`doSendChatsLog():: sending reply `,reply);
    this.net.sendReply(remIp,reply);
  }
   
  async writeNewChatToChanLog(remIp,chanId,chat) {
    let msg = {
      req      : 'persistChatToDB',
      response : 'persistChatToDBResult',
      chanId   : chanId,
      chat     : chat
    }
    let doTry = await this.net.reqReply.waitForReply(remIp, msg);
    return doTry
  }  

  async doPersistChatToDB(remIp,j){
    let reply = {
      response  : 'persistChatToDBResult',
      reqId     : j.reqId,
      result    : 'OK'
    }
    const chat = j.chat;
    const SQL = 'INSERT into `bchat`.`tblChanState` (csCCMasterID,csFrom,csText,csTime) values (?,?,?,?) ';
    const params = [j.chanId,chat.from,chat.text,chat.time];
    const newChatId = await new Promise((resolve, reject) => {
      this.db.query(SQL, params, (err, result) => {
        if (err) {
          resolve(null);
          reply.result = 'DB_FAIL';
          return;
        }
        resolve('OK');
      });
    });
    console.log(`writeNewChatToChanLog(j.chanId,chat):: `,j.chanId,chat,SQL,params,newChatId,reply);  
    this.net.sendReply(remIp,reply);
  }
  async attachUser(userMUID){
    // Keep a map of user profile info to reduce calls to mailTree 
    const profile = await this.PTree.mailTreeQryBorgUserProfile(userMUID);
    console.log(`attachUser(userMUID):: profile`,profile);
    if (profile.error === false && profile.status === 200 && profile.json.result === true){
      this.activeUsers.set(userMUID,profile.json.tRec);
      console.log(`attachUser(userMUID):: `,this.activeUsers);
      return;
    }
    console.log(`attachUser(userMUID):: FAILED `,userMUID);
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
    console.log('handleBCast():: heard! ',j);
    if (j.remIp == this.net.nIp && j.msg?.include !== 'self') {
      console.log('ignoring bcast to self',this.net.nIp,j);
      return;
    }

    if (j.msg.req){
      if (j.msg.req === 'findHotChan'){
        this.doFindHotChan(j.msg,j.remIp);
        return;
      }
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
  async doPushOutNewChat(remIp,msg) {
    await this.attachUser(msg.ownMUID);
    this.websoc.rooms.addUser(msg.ownMUID,this.net.borgMasterID);
    await this.websoc.rooms.pushNewMsg(msg.ownMUID,msg);
  }
  async doOpenNewHotNode(remIp,msg) {
    if (this.websoc.rooms === null) await this.websoc.init();
    if (this.websoc.rooms === null) {
      this.websoc.rooms = new channelMgr(this);
    }
    await this.attachUser(msg.ownMUID);
    this.websoc.rooms.addUser(msg.ownMUID,this.net.borgMasterID);

    await this.websoc.rooms.pushNewMsg(msg.ownMUID,msg);

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

    if (j.req === 'persistChatToDB'){
      await this.doPersistChatToDB(remIp,j);
      return true;
    }
    if (j.req === 'sendChatsLog'){
      await this.doSendChatsLog(remIp,j);
      return true;
    }
    if (j.req === 'directChatReq') {
      this.handleDirectChatReq(j);
      return true;
    }
    if (j.req === 'pushOutNewChat'){
      this.doPushOutNewChat(j.remIp,j.msg);
      return;
    }
    if (j.req === 'storeNewChannel'){
      this.doStoreNewChannel(j);
      return true;
    }
    return false;
  }
  async findActiveChanHosts(chanId=this.net.borgMasterID) {
    let BCast = {
      req      : 'findHotChan',
      response : 'findHotChanResult',
      chanId   : chanId,
      include  : 'self'
    }
    let hotNodes = await this.net.bcastMgr.getReplies(BCast,500);

    console.log(`checkForBorgMasterChannel():: hotnodes `,hotNodes);
    if (Array.isArray(hotNodes)) {
      return hotNodes.map(item => ({ remIp: item.reply.remIp, status: item.reply.status }));
    }
    if (hotNodes.result === 'NOBODY') {
      return null;
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
      response : 'getMasterChannelResult',
      include  : 'self'
    }
    let doTry = await this.net.bcastMgr.getReplies(BCast);

    //console.log(`checkForBorgMasterChannel():: `,doTry);
    if (Array.isArray(doTry)) {
      return doTry.map(item => ({ remIp: item.reply.remIp, result: item.reply.result }));
    }
    if (doTry.result === 'NOBODY') {
      return null;
    }
    return false;
  }
  async doFindHotChan(j,remIp){
    const reply = {
      response : 'findHotChanResult',
      reqId    : j.reqId,
      result   : 'OK',
      include  : 'self'
    }

    const rooms = this.websoc.rooms
    if (rooms === null) {
      return;
    }
    let hotChan = rooms.liveChannels.get(j.chanId);
    if (!hotChan) {
      return;
    } 
    reply.status = {isHot:true,ncons: hotChan.users.size};
    console.log(`doFindHotChan(j,remIp):: found... sending`,remIp,reply);
    this.net.sendReply(remIp, reply);
  }
  async doGetMasterChannel(remIp,j){
    const reply = {
      response : 'getMasterChannelResult',
      reqId    : j.reqId,
      result   : 'OK',
      include  : 'self'
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
    if (nRec > 0){
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
      const reqId = crypto.randomUUID();
      var req = {
        req    : 'sendNodeList',
        reqId  : reqId,
        nodes  : maxIP,
        xnodes : excludeIps,
        work   : crypto.randomBytes(20).toString('hex')
      }

      this.net.broadcast(req);
      this.net.on('mkyReply', mkyReply = (r)=>{
        if (r.req === 'pNodeListGenIP' && r.reqId === reqId) {
          //console.log('mkyReply NodeGen is:',r);
          if (IPs.length < maxIP  && !IPs.includes(r.remIp)) {
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
    this.net.gpow.doPow(2,j.work,remIp,j.reqId);
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
    this.hotNodes = await this.cell.findActiveChanHosts();
    if (this.hotNodes?.result === 'NOBODY' || this.hotNodes === null) this.hotNodes = [];
 
    console.log(`init():: hotNodes`,this.hotNodes);
    if (Array.isArray(found)) {
      this.loungeHosts = found;
      return;
    }
    this.loungeHosts = [];
  }
  thisNodeIsHot(){
    this.hotNodes.forEach( (node) =>{
      if (node.ip === this.cell.net.rnet.myIp)
        return true;
    });
    return false;
  }
  doRedirectToHotNode(user,chanId=this.cell.net.borgMasterID){
    const randomIndex = Math.floor(Math.random() * this.hotNodes.length);
    const msg = {
      type         : 'doRedirectToIp',
      redirectToIp : this.hotNodes[randomIndex].remIp,
      chanId       : chanId
    }
    this.sendToAddress(user, msg);
  }
  async handleWSNewUser(borgToken){
    console.log(`handleWSNewUser():: `,borgToken);
    this.isRedirect = borgToken.data.isRedirect;
    if (this.isRedirect === false){
      await this.init();
      if (this.hotNodes.length > 0){
        if (this.thisNodeIsHot() !== true) {
          this.doRedirectToHotNode(borgToken.Address);
          return;
        } 
      }
      if (this.rooms === null)
        this.rooms = new channelMgr(this.cell);
    } 
    await this.cell.attachUser(borgToken.Address);

    this.rooms.addUser(borgToken.Address,this.cell.net.borgMasterID);
    const msg = {
      type: 'openBorgChannel',
      chan: {
        chanID    : this.cell.net.borgMasterID,
        title     : 'Borg Space Lounge',
        chanState : await this.rooms.getChanState(this.cell.net.borgMasterID,this.loungeHosts)
      },
      timestamp: Date.now()
    } 
    this.sendToAddress(borgToken.Address, msg);
  }
  sendNewMsg(chanId,user,chat){
    console.log(`sendNewMsg(user,chat):: `,chanId,user,chat);
    const msg = {
      type        : 'pushBorgChat',
      chanId      : chanId,
      chatMessage : chat
    }
    this.sendToAddress(user, msg);
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

    let reqOK = false;
    switch (msg.req) {
      case 'createBorgChannel':
        responseMsg.json = await this.doCreateBorgChannel(msg);
        reqOK = true;
        break;
    }
    console.log(`reqOK::`,reqOK);
    if (reqOK === false) {
      switch (msg.type) {
        case 'chat':
          await this.rooms.pushNewMsg(identity.Address,responseMsg);
          responseMsg.json = {chat: 'OK'}; 
          break;

        default:
          responseMsg.json = {error: true,msg: 'No Handler Found For Request'};
      } 
    }
    // Send the enhanced response using parent logic
    super.handleWSMessage(responseMsg, ws, clientId, identity);
  }
  async doCreateBorgChannel(msg){
    msg.data.ownMUID = msg.borgToken.Address;
    
    console.log(`doCreateBorgChannel():: starting`,msg);
    let doTry = await this.cell.cellCreateBorgChannel(msg);
    console.log(`doCreateBorgChannel():: doTry`,doTry);
    return doTry; //{error:true,msg: 'doCreateBorgChannel method incomplete'};
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
