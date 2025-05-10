const fs = require('fs');

const options = {
  key: fs.readFileSync('keys/privkey.pem'),
  cert: fs.readFileSync('keys/fullchain.pem')
};
//const {MkyNetNode,MkyNetObj,MkyNetTab}   = require('./peerTree');
const {PeerTreeNet}     = require('./peerTree');
const {mailTreeObj,mailTreeCellReceptor} = require('./mailTreeObj.js');

/*******************
Create PeerTree Network Peer
*******************
*/

  var parm = process.argv[3];

  var reset = null
  if (parm == 'rootReset'){
    reset = true;
  }
  const netPort  = 13393;
  const recpPort = 13395;
  const monPort  = 13394;
  const maxChildren = 25;
  const netName  = 'mailCell';

  const mkyNet = new PeerTreeNet(options,netName,netPort,monPort,maxChildren);
  mkyNet.nodeType = netName;

  main();

async function main(){
    await mkyNet.netStarted();
    startMailCell();
}
function startMailCell(){
    var mcell = new mailTreeObj(mkyNet,reset);
    const mcellReceptor = new mailTreeCellReceptor(mcell,recpPort);
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

