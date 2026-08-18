#!/bin/bash
# Boot one mailTree cell plus its own co-located cronoTreeCell.
#
# Every borgIOS cell depends on a cronoTree cell running locally: peerTree.js
# asks localhost:13397 for network time (MkyRouting.applyCronoTreeTime), so each
# container runs cronoTreeCell.js next to mailTreeCell.js.
#
#   NODE_NAME       label used in logs
#   BOOTSTRAP_IPS   comma separated peer IPs seeded into both node list files
#   DB_HOST         host running this cell's own mariadb (mailTree + shellFarmer)
set -u

cd /peerTree

# Source trees are mounted read only; overlay borgIOS on top of the PeerTree
# core so the cell runs the branch under test straight from the checkout.
cp -f /src/peertree/*.js /peerTree/ 2>/dev/null
cp -f /src/borgios/*.js  /peerTree/ 2>/dev/null

mkdir -p keys ftree

DB_HOST="${DB_HOST:-db}"
# both mailTreeObj (dbconf) and shellFarmerDB (shellfarmerdbconf) hardcode
# 127.0.0.1:3306 -> forward it to this cell's own db container
socat TCP-LISTEN:3306,fork,reuseaddr TCP:"${DB_HOST}":3306 &

if [ ! -f keys/privkey.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout keys/privkey.pem -out keys/fullchain.pem -subj "/CN=${NODE_NAME:-mailtree}" >/dev/null 2>&1
fi

cat > dbconf <<EOF
{"user":"${DB_USER:-shellfarmer}","pass":"${DB_PASS:-shellfarmer}"}
EOF
cp -f dbconf shellfarmerdbconf

cat > keys/mailTree.conf <<EOF
{"receptor":{"port":13395,"allow":["127.0.0.1","${ALLOW_IP:-0.0.0.0}"]}}
EOF

seed_nodes () {
  local file="$1"
  if [ -n "${BOOTSTRAP_IPS:-}" ] && [ ! -f "${file}" ]; then
    node -e '
      const fs=require("fs");
      const ips=process.env.BOOTSTRAP_IPS.split(",").filter(Boolean);
      fs.writeFileSync(process.argv[1], JSON.stringify(ips.map(ip=>({ip})),null,1));
    ' "$file"
  fi
}
seed_nodes "keys/myNodeList-13396-cronoTreeCell.net"
seed_nodes "keys/myNodeList-13393-mailTreeCell.net"

echo "[$(date -u +%T)] ${NODE_NAME:-cell} ip=$(hostname -i) db=${DB_HOST} bootstrap=${BOOTSTRAP_IPS:-none}"

# local time authority first
node cronoTreeCell.js > /peerTree/crono.log 2>&1 &
sleep "${CRONO_WARMUP:-8}"

exec node mailTreeCell.js
