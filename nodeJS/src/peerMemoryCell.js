const fs = require('fs');

const options = {
  key: fs.readFileSync('keys/privkey.pem'),
  cert: fs.readFileSync('keys/fullchain.pem')
};
//const {MkyNetNode,MkyNetObj,MkyNetTab}   = require('./peerTree');
const {PeerTreeNet}     = require('./peerTree');
const {peerMemoryObj,peerMemCellReceptor} = require('./peerMemoryObj.js');

/*******************
Create PeerTree Network Peer
*******************
*/

  var parm = process.argv[3];

  var reset = null
  if (parm == 'rootReset'){
    reset = true;
  }
  
  const netPort  = 1336;
  const recpPort = 1335;
  const monPort  = 1339;
  const maxChildren = 25;
  const netName  = 'peerMemoryCell';

  const mkyNet = new PeerTreeNet(options,netName,netPort,monPort,maxChildren);
  mkyNet.nodeType = netName;

  main();

async function main(){
    await mkyNet.netStarted();
    startMemoryCell();
}
function startMemoryCell(rBranch){
    var mcell = new peerMemoryObj(mkyNet,reset);
    const mcellReceptor = new peerMemCellReceptor(mcell,recpPort);
    mcell.attachReceptor(mcellReceptor);

    mcell.net.on('mkyReq',(res,j)=>{
      mcell.handleReq(res,j);
    });
    mcell.net.on('bcastMsg',j =>{
      mcell.handleBCast(j);
    });
    mcell.net.on('mkyReply', j =>{
      mcell.handleReply(j);
    });
    mcell.net.on('xhrFail', j =>{
      console.log('xhrFail is->',j);
      mcell.handleXhrError(j);
    });
}

