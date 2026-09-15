#!/bin/bash
set -e

echo "=== BorgInferenceCell Installer (PeerTree) ==="

# ---------------------------------------------------------
# Firewall
# ---------------------------------------------------------
ufw allow 11400/tcp    # PeerTree network
ufw allow 11401/tcp    # Receptor port
ufw allow 11402/tcp    # Monitor port
#ufw allow 10398/tcp   # Websocket

# ---------------------------------------------------------
# Disable NTP (PeerTree uses chrony discipline)
# ---------------------------------------------------------
timedatectl set-ntp false

# ---------------------------------------------------------
# Install Node.js 20
# ---------------------------------------------------------
curl -sL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
bash nodesource_setup.sh
apt install -y nodejs

# ---------------------------------------------------------
# Directory layout
# ---------------------------------------------------------
mkdir -p /peerTree
mkdir -p /peerTree/keys
mkdir -p /peerTree/ftree
mkdir -p /mnt/db
mkdir -p /mnt/db/dumps

cd /peerTree

# ---------------------------------------------------------
# Download PeerTree core libs
# ---------------------------------------------------------
curl https://admin.bitmonky.com/bitMDis/peerTree.js          -o peerTree.js
curl https://admin.bitmonky.com/bitMDis/DStreamMgrObj.js     -o DStreamMgrObj.js
curl https://admin.bitmonky.com/bitMDis/peerCrypt.js         -o peerCrypt.js
curl https://admin.bitmonky.com/bitMDis/shellFarmerDB.js     -o shellFarmerDB.js
curl https://admin.bitmonky.com/bitMDis/addslashes.js        -o addslashes.js
curl https://admin.bitmonky.com/bitMDis/mkyDatef.js          -o mkyDatef.js
curl https://admin.bitmonky.com/bitMDis/networkWebConsole.js -o networkWebConsole.js
curl https://admin.bitmonky.com/bitMDis/bitWebMoniter.js     -o bitWebMoniter.js

# ---------------------------------------------------------
# Download BTrader organism files
# ---------------------------------------------------------
curl https://admin.bitmonky.com/bitMDis/borgInferenceObj.js   -o borgInferenceObj.js
curl https://admin.bitmonky.com/bitMDis/borgInferenceCell.js  -o borgInferenceCell.js
curl https://admin.bitmonky.com/bitMDis/pstartBInferCell.sh   -o pstartBInferCell.sh

chmod 774 pstartBInferCell.sh

# ---------------------------------------------------------
# TLS Certificate Generation
# ---------------------------------------------------------
mkdir -p keys

openssl genrsa -out keys/private.key 2048
openssl req -new -key keys/private.key -out keys/certificate.csr -subj "/CN=localhost"
openssl x509 -req -days 365 -in keys/certificate.csr -signkey keys/private.key -out keys/certificate.crt
rm keys/certificate.csr

mv keys/private.key keys/privkey.pem
mv keys/certificate.crt keys/fullchain.pem

chmod 644 keys/fullchain.pem
chmod 600 keys/privkey.pem

echo "SSL certificates generated."

# ---------------------------------------------------------
# Node dependencies
# ---------------------------------------------------------
npm install mysql
npm install mysql2
npm install axios
npm install portscanner
npm install bs58
npm install elliptic
npm install dns-sync
npm install bitcoinjs-lib
npm install node-schedule
npm install ws
npm install -g pm2

# Install Shell Farmer DB And CronoTreeCell network.

curl https://admin.bitmonky.com/cronoTreeProd_debian.sh | bash

# ---------------------------------------------------------
# Done
# ---------------------------------------------------------
echo "=== BorgInference install complete ==="


