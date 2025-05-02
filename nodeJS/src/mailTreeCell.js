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
  const mkyNet = new PeerTreeNet(options,'mailCell',13393,13394);
  mkyNet.nodeType = 'mailCell';

  main();

async function main(){
    await mkyNet.netStarted();
    startMailCell();
}
function startMailCell(){
    var mcell = new mailTreeObj(mkyNet,reset);
    const mcellReceptor = new mailTreeCellReceptor(mcell,13395);
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

