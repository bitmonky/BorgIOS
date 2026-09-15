#!/bin/bash

# BorgInferenceCell Updater Debian/Ubuntu

cd /peerTree

# ---------------------------------------------------------
# Download PeerTree core libs
# ---------------------------------------------------------
curl https://admin.bitmonky.com/bitMDis/peerNodeMgr.js       -o peerNodeMgr.js
curl https://admin.bitmonky.com/bitMDis/peerTree.js          -o peerTree.js
curl https://admin.bitmonky.com/bitMDis/DStreamMgrObj.js     -o DStreamMgrObj.js
curl https://admin.bitmonky.com/bitMDis/peerCrypt.js         -o peerCrypt.js
curl https://admin.bitmonky.com/bitMDis/shellFarmerDB.js     -o shellFarmerDB.js
curl https://admin.bitmonky.com/bitMDis/addslashes.js        -o addslashes.js
curl https://admin.bitmonky.com/bitMDis/mkyDatef.js          -o mkyDatef.js
curl https://admin.bitmonky.com/bitMDis/networkWebConsole.js -o networkWebConsole.js
curl https://admin.bitmonky.com/bitMDis/bitWebMoniter.js     -o bitWebMoniter.js
curl https://admin.bitmonky.com/bitMDis/borgIOSptreeAPI.js   -o borgIOSptreeAPI.js
curl https://admin.bitmonky.com/bitMDis/ptreeReceptorObj.js  -o ptreeReceptorObj.js

# ---------------------------------------------------------
# Download BTrader organism files
# ---------------------------------------------------------
curl https://admin.bitmonky.com/bitMDis/borgInferenceObj.js   -o borgInferenceObj.js
curl https://admin.bitmonky.com/bitMDis/borgInferenceCell.js  -o borgInferenceCell.js
curl https://admin.bitmonky.com/bitMDis/pstartBInferCell.sh   -o pstartBInferCell.sh


echo "BorgInferenceCell updates complete!"
echo "Start with: pm2 start borgInferenceCell.js"

node borgInferecnceCell.js
