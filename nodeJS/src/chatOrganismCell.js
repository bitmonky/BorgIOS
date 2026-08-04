process.title = 'chatOrganismCell';

const fs = require('fs');
const { PeerTreeNet } = require('./peerTree');
const { ChatOrganismObj, ChatOrganismReceptor, ChatOrganismWebSoc } = require('./chatOrganismObj.js');

const options = {
  key: fs.readFileSync('keys/privkey.pem'),
  cert: fs.readFileSync('keys/fullchain.pem')
};

const borg = {
  netPort : 11396,
  recpPort: 11397,
  monPort : 11398,
  wsPort  : 10398,
  maxChildren: 3,
  netName : process.title
};
console.log('hey');
const mkyNet = new PeerTreeNet(
  options,
  borg.netName,
  borg.netPort,
  borg.monPort,
  borg.maxChildren
);

async function main() {
  const cell = new ChatOrganismObj(mkyNet);
  mkyNet.organismObj = cell;

  await mkyNet.netStarted();
  mkyNet.updatePortalsFile(borg);
  startCell(cell);
}

function startCell(cell) {
  const receptor = new ChatOrganismReceptor(cell, borg.recpPort);
  const websoc   = new ChatOrganismWebSoc(cell,borg.wsPort);
  cell.attachReceptor(receptor,websoc);

  cell.net.on('mkyReq', (res, j) => cell.handleReq(res, j));
  cell.net.on('bcastMsg', j => cell.handleBCast(j));
}

main();

