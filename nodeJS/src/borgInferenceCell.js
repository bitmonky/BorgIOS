// Declair A Unique Tree Type/Name  
process.title = 'borgInferenceCell';

const fs = require('fs');

// Link your self signed certs 
const options = {
  key: fs.readFileSync('keys/privkey.pem'),
  cert: fs.readFileSync('keys/fullchain.pem')
};

// Require the PeerTree Base Class
const {PeerTreeNet}     = require('./peerTree');

// Import The Application Code For Your Tree Type
const {BorgInferenceObj,BorgInferenceReceptor} = require('./borgInferenceObj.js');


/*
 * Configure borgInferenceCell Communcation Ports
 *
*/

  var parm = process.argv[2];
  console.log('parm',parm);
  var reset = null
  if (parm == 'rootReset'){
    reset = true;
  }
  const borg = {
    netPort  : 11400,
    recpPort : 11401,
    monPort  : 11402,
    maxChildren : 25,
    netName  : process.title
  }
 
  const mkyNet = new PeerTreeNet(options,borg.netName,borg.netPort,borg.monPort,borg.maxChildren);
  mkyNet.nodeType = borg.netName;

  //Start The Cell.
  main();

async function main(){
    const cell = new BorgInferenceObj(mkyNet,reset);
    await mkyNet.netStarted();
    mkyNet.updatePortalsFile(borg);
    startInferenceCell(cell);
}

// Initialize Network Event Handlers

function startInferenceCell(cell){
    cell.startCell();
    const cellReceptor = new BorgInferenceReceptor(cell,borg.recpPort);
    cell.attachReceptor(cellReceptor);

    cell.net.on('mkyReq',(res,j)=>{
      cell.handleReq(res,j);
    });
    cell.net.on('bcastMsg',j =>{
      cell.handleBCast(j);
    });
    cell.net.on('mkyReply', j =>{
      cell.handleReply(j);
    });
    cell.net.on('xhrFail', j =>{
      cell.handleXhrError(j);
    });
}

