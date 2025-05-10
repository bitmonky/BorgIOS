/***************************************************
ftreeFileMgr App - ftreeFileMgrCell
Create Public Code Repos distibuted randomly accross the internet;
Status 2024-0131 - Incomplete
*/
const fs = require('fs');

const options = {
  key: fs.readFileSync('keys/privkey.pem'),
  cert: fs.readFileSync('keys/fullchain.pem')
};
//const {MkyNetNode,MkyNetObj,MkyNetTab}   = require('./peerTree');
const {PeerTreeNet}     = require('./peerTree');
const {peerPaysObj,peerPaysCellReceptor} = require('./peerPaysObj.js');

/*******************
Create PeerTree Network Peer
*******************
*/

  var isRoot = process.argv[3];

  var reset = null
  if (isRoot == 'rootReset'){
    isRoot == 'root';
    reset = true;
  }
  if (isRoot == 'rootRebuild'){
    isRoot == 'root';
    reset = 'rebuild';
  }
  const netPort  = 13390;
  const recpPort = 13392;
  const monPort  = 13391;
  const maxChildren = 25;
  const netName  = 'peerPay';

  const peerNet = new PeerTreeNet(options,netName,netPort,monPort,maxChildren);
  peerNet.nodeType = netName;

  if (isRoot == 'reset'){
    isRoot = null;
    reset = true;
  }
    
main();
async function main(){
  await peerNet.netStarted();
  startFtreeCell();
}
var rBranch = null;
function startFtreeCell(){
    var scell = new peerPaysObj(peerNet,reset);
    const scellReceptor = new peerPaysCellReceptor(scell,recpPort);
    scell.attachReceptor(scellReceptor);
    if (rBranch){
      console.log('\nNEW>>>SETTING ftreeCell TO ROOT');
      scell.isRoot = true;
    }
    scell.net.on('mkyReq',(res,j)=>{
      scell.handleReq(res,j);
    });
    scell.net.on('bcastMsg',j =>{
      scell.handleBCast(j);
    });
    scell.net.on('mkyReply', j =>{
      scell.handleReply(j);
    });
    scell.net.on('xhrFail', j =>{
      scell.handleXhrError(j);
    });
}
