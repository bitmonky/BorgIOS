const PtreeReceptor    = require('./ptreeReceptorObj');
const {MkyWebConsole}  = require('./networkWebConsole.js');
const fs               = require('fs');
const crypto           = require('crypto');

const  OpenAI  = require("openai");

const conf = JSON.parse(fs.readFileSync('keys/opai.conf', 'utf8'));
console.log('conf',conf);


const openai = new OpenAI(conf);
class BorgInferenceReceptor extends PtreeReceptor {
  constructor(peerTree, port) {
    super(peerTree, port);
  }

  handleReq(j, res) {
    switch (j.msg.req) {
      case  'getTextStream':
        this.getTextStream(j.msg, res);
        return;
      
      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Unknown request: ${j}` }));
    }
  }
  async getTextStream(j, res) {
    if (!('maxTokens' in j)) {
      j.maxTokens = 100;
    }
    if (!('useModel' in j)) {
      j.useModel = 'deepseek-chat';
    }
    if (!('temperature' in j)) {
      j.temperature = 0.85;
    }

    console.log('Input:', j);
    try {
      // Start streaming response
      const response = await openai.chat.completions.create({
        messages: [{ role: 'user', content: j.prompt }],
        model: j.useModel,
        max_tokens: j.maxTokens,
        temperature: j.temperature,
        stream: true, // Enable streaming
      });

      // Set headers for streaming once
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Stream both reasoning_content and content to the client
      for await (const chunk of response) {
        //console.log(chunk);
        //console.log(chunk.choices);
        const delta = chunk.choices[0].delta;

        // Stream Reasoning of Thought
        if (delta.reasoning_content) {
          res.write(`data: Reasoning of Thought: ${delta.reasoning_content}`);
        }
        // Stream Main Content
        if (delta.content) {
          res.write(`data: Content: ${delta.content}`);
        }
        if (chunk.usage){
          res.write(`usage: Content: ${JSON.stringify(chunk.usage)}`);
        }
      }

      // End the stream after all chunks are sent
      res.end();
    } catch (error) {
      console.error('Error occurred:', error.message);

      // Check if headers are already sent
      if (!res.headersSent) {
        retEr('getText Error: ' + error.message, res);
      }
    }
  }
}

class BorgInferenceObj {
  constructor(peerTree,reset){
    this.reset        = reset;
    this.isRoot       = null;
    this.status       = 'starting';
    this.net          = peerTree;
    this.receptor     = null;
    this.wcon         = new MkyWebConsole(this.net,null,this,'borgAgentCell');
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
  }
  handleXhrError(j){
    if (!j.msg)
      return;    
    const msg = j.msg;
  }
  handleReq(res,j){
    if (!this.isRoot && this.status != 'Online'){
      return true;
    }
    return false;
  }
  handleReply(r){
    if (r.req == 'doSomthingExample'){
      //do somestuff an pass result back to receptor
      //this.receptor.processResponse(r);
      return;
    } 
  }
  handleBCast(j){
    if (j.remIp == this.net.nIp) {
      //console.log('ignoring bcast to self',this.net.nIp);return;
      return;
    } 
    if (!j.msg.to) {return;}
    if (j.msg.to == 'cronoAgents'){
      if (j.msg.req == 'someBCastRequest'){
        var qres = {req : 'someBCastRequestReply', someData : 'bla...'};
        this.receptor.someBCastREsult(j.remIp,qres);        
      }
      if (j.msg.req){
        // Sample goPOW (proof work random node selection.
        if (j.msg.req == 'sendNodeList'){
          console.log('DOPOW xxxx',j.remIp);
          this.doPow(j.msg,j.remIp);
        }
        if (j.msg.req == 'stopNodeGenIP'){
          console.log('DOPOW stopNodeGenIP-XX Received:',j.remIp);
          this.doPowStop(j.remIp);
        }
      }
    } 
    return;
  }
  sayHelloPeerGroup(){
    var breq = {
      to : 'cronoAgents',
      token : 'hello'
    }

    this.net.broadcast(breq);
    const gtime = setTimeout( ()=>{
      this.sayHelloPeerGroup();
    },15*1000);
  }
  doPowStop(remIp){
    this.net.gpow.doStop(remIp);
  }
  doPow(j,remIp){
    this.net.gpow.doPow(2,j.work,remIp);
  }
  receptorReqStopIPGen(work){
    var req = {
      to : 'cronoAgents',
      req : 'stopNodeGenIP',
      work  : work
    }
    this.net.broadcast(req);
  }
  receptorReqNodeList(j,exIPs=[],nCopys=3){
    return new Promise( (resolve,reject)=>{
      var mkyReply = null;
      let maxIP = j?.agent?.nCopys;
      if (!maxIP) maxIP = nCopys;
      var   IPs = [];
      const gtime = setTimeout( ()=>{
        console.log('Send Node List Request Timeout:');
        this.net.removeListener('mkyReply', mkyReply);
        resolve(IPs);
      },7*1000);

      var req = {
        to : 'cronoAgents',
        req : 'sendNodeList',
        nodes : maxIP,
        work  : crypto.randomBytes(20).toString('hex') 
      }

      this.net.broadcast(req);
      this.net.on('mkyReply', mkyReply = (r)=>{
        if (r.req == 'pNodeListGenIP'){
          //console.log('mkyReply NodeGen is:',r);
          if (IPs.length < maxIP){
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
};	  

function  retEr(msg,res){
  res.end('{"result":false,"message":"'+msg+'"}\n');
}

function sleep(ms){
  return new Promise(resolve=>{
    setTimeout(resolve,ms)
  })
}

module.exports.BorgInferenceObj = BorgInferenceObj;
module.exports.BorgInferenceReceptor = BorgInferenceReceptor;

