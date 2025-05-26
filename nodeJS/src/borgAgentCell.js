const fs = require('fs');

const options = {
  key: fs.readFileSync('keys/privkey.pem'),
  cert: fs.readFileSync('keys/fullchain.pem')
};
//const {MkyNetNode,MkyNetObj,MkyNetTab}   = require('./peerTree');
const {PeerTreeNet}     = require('./peerTree');
const {borgAgentObj,borgAgentCellReceptor} = require('./borgAgentObj.js');

process.on('uncaughtException', (err) => {
    console.error('Unhandled Exception:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port is already in use. Exiting...`);
      process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection:', reason);
});

/*******************
Create PeerTree Network Peer
*******************
*/

  var parm = process.argv[2];
  console.log('parm',parm);
  var reset = null
  if (parm == 'rootReset'){
    reset = true;
  }
  const borg = {
    netPort  : 13550,
    recpPort : 1396,
    monPort  : 13551,
    maxChildren : 25,
    netName  : 'borgAgentCell'
  }

 
  const mkyNet = new PeerTreeNet(options,borg.netName,borg.netPort,borg.monPort,borg.maxChildren);
  mkyNet.nodeType = borg.netName;

  var streamOptions = null;
  if (parm == 'streamOn'){
    streamOptions = {
      key: fs.readFileSync('/etc/letsencrypt/live/16zvq6amrcxsz6bcnprshhdtjcel3thits.borgios.net/privkey.pem'),
      cert: fs.readFileSync('/etc/letsencrypt/live/16zvq6amrcxsz6bcnprshhdtjcel3thits.borgios.net/fullchain.pem'),
    };
  }
  main();

async function main(){
    await mkyNet.netStarted();
    mkyNet.updatePortalsFile(borg);
    startMemoryCell();
}
function startMemoryCell(rBranch){
    var mcell = new borgAgentObj(mkyNet,reset);
    const mcellReceptor = new borgAgentCellReceptor(mcell,borg.recpPort);
    console.log('Checking For Borg Stream Option::',streamOptions);
    if (streamOptions){
      console.log('Initiate Borg Stream Monitor');
      mcellReceptor.initWebStreamViewer(streamOptions);
    }
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

