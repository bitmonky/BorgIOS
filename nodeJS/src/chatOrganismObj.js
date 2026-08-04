/*
* Distributed Chat Organism
*/

const PtreeReceptor = require('./ptreeReceptorObj');
const PtreeWebSoc   = require('./ptreeWebSocObj');

class ChatOrganismObj {
  constructor(peerTree, reset) {
    this.chatLog = [];   // distributed chat history
    this.reset        = reset;
    this.isRoot       = null;
    this.status       = 'starting';
    this.net          = peerTree;
    this.receptor     = null;
    this.websoc       = null;
  }
  attachReceptor(inReceptor,websoc){
    this.receptor = inReceptor;
    this.websoc   = websoc;
  }

  // ---------------------------------------------------------
  // Broadcast a chat message to all nodes
  // ---------------------------------------------------------
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
  handleBCast(j) {
    if (j.req === 'chatMsgBCast') {
      this.chatLog.push(j.data);
    }
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

    let reply = await this.net.reqReplyObj.waitForReply(toIp, msg);

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
  // Main request handler
  // ---------------------------------------------------------
  async handleReq(remIp, j) {
    if (j.req === 'directChatReq') {
      this.handleDirectChatReq(j);
      return true;
    }
    return false;
  }
}

class ChatOrganismWebSoc extends PtreeWebSoc {
  constructor(peerTree,port){
    super(peerTree, port);
    this.cell = peerTree;
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
