#!/bin/bash

# Debian/Ubuntu - PeerPays / shardTree installer

apt update -y
apt upgrade -y

# Make sure hostname has a /etc/hosts entry.
sudo sed -i '/^127\.0\.1\.1[[:space:]]*'"$(hostname)"'$/!{/^127\.0\.0\.1[[:space:]]*localhost/ s/$/ '"$(hostname)"'/}' /etc/hosts

apt install -y systemd-timesyncd
timedatectl set-ntp true
systemctl restart systemd-timesyncd
apt-get install -y chrony

timedatectl set-timezone America/Toronto
hostnamectl set-hostname shardTree

# Change default SSH port
sed -i 's/#Port 22/Port 1441/g' /etc/ssh/sshd_config
echo "Changing ssh Port! Please reconnect"
systemctl restart sshd

# Open SSH and PeerPays ports (keep receptor closed / IP-restricted)
ufw allow 1441/tcp
ufw allow 13390/tcp
ufw allow 13391/tcp
ufw allow 13392/tcp

timedatectl set-ntp false

# Install Node.js 20
curl -sL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
bash nodesource_setup.sh
apt install -y nodejs

# Base directories
mkdir -p /peerTree
mkdir -p /peerTree/keys
mkdir -p /peerTree/ftree
mkdir -p /peerTree/db
chmod 700 /peerTree/db
mkdir -p /mnt/db/dumps

cd /peerTree

# Core BorgIOS / PeerPays files
curl https://admin.bitmonky.com/bitMDis/peerTree.js          -o peerTree.js
curl https://admin.bitmonky.com/bitMDis/peerCrypt.js         -o peerCrypt.js
curl https://admin.bitmonky.com/bitMDis/addslashes.js        -o addslashes.js
curl https://admin.bitmonky.com/bitMDis/mkyDatef.js          -o mkyDatef.js
curl https://admin.bitmonky.com/bitMDis/networkWebConsole.js -o networkWebConsole.js
curl https://admin.bitmonky.com/bitMDis/bitWebMoniter.js     -o bitWebMoniter.js
curl https://admin.bitmonky.com/bitMDis/peerPaysCell.js      -o peerPaysCell.js
curl https://admin.bitmonky.com/bitMDis/peerPaysObj.js       -o peerPaysObj.js
curl https://admin.bitmonky.com/bitMDis/pstartPayscell.sh    -o pstartPayscell.sh
curl https://admin.bitmonky.com/bitMDis/peerPayTpl.sql       -o /mnt/db/dumps/peerPayTpl.sql
curl https://admin.bitmonky.com/bitMDis/myNodeList-13390-peerPay.net -o keys/myNodeList-13390-peerPay.net

chmod 774 p*.sh

# SSL keypair for local TLS
mkdir -p keys

openssl genrsa -out keys/private.key 2048
openssl req -new -key keys/private.key -out keys/certificate.csr -subj "/CN=localhost"
openssl x509 -req -days 365 -in keys/certificate.csr -signkey keys/private.key -out keys/certificate.crt
rm keys/certificate.csr

echo "SSL certificates generated and stored in 'keys/' folder."

mv keys/private.key keys/privkey.pem
mv keys/certificate.crt keys/fullchain.pem

chmod 644 keys/fullchain.pem
chmod 600 keys/privkey.pem

# Node.js dependencies
npm install bitcoinjs-lib
npm install dns-sync
npm install elliptic
npm install mysql
npm install mysql2
npm install axios
npm install portscanner
npm install bs58
npm install node-schedule
npm i -g pm2

# Function to check if a package is installed
is_installed() {
    dpkg -l | grep -qw "$1"
}

echo "*** [BorgIOS] Preparing secure MariaDB environment..."

# Force MariaDB to bind only to localhost (pre-create config)
mkdir -p /etc/mysql/mariadb.conf.d
cat <<EOF >/etc/mysql/mariadb.conf.d/borgios.cnf
[mysqld]
bind-address = 127.0.0.1
skip-networking = 0
skip-bind-address = 0
local-infile = 0
symbolic-links = 0
EOF

# Install MariaDB if missing
if is_installed "mysql-server" || is_installed "mariadb-server"; then
    echo "MySQL or MariaDB is already installed."
else
    echo "Neither MySQL nor MariaDB is installed. Installing MariaDB..."
    apt-get update
    apt-get install -y mariadb-server

    if is_installed "mariadb-server"; then
        echo "MariaDB installed successfully."
    else
        echo "Failed to install MariaDB."
        exit 1
    fi
fi

systemctl enable mariadb
systemctl restart mariadb

# Verify DB is running
if ! mysqladmin ping --silent; then
    echo "Error: MariaDB failed to start."
    exit 1
fi

# Lock down default accounts
mysql -e "DELETE FROM mysql.user WHERE User='';"
mysql -e "DELETE FROM mysql.user WHERE User='root' AND Host!='localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Create random password and DB user for PeerPays
PASSWDDB="$(openssl rand -hex 18)"
USERID="peerPaysDBA"
PBRAIN="peerPay"

echo "{\"user\":\"${USERID}\",\"pass\":\"${PASSWDDB}\"}" > /peerTree/db/paysdb.json
chmod 600 /peerTree/db/paysdb.json

mysql -e "DROP DATABASE IF EXISTS ${PBRAIN};"
mysql -e "CREATE DATABASE ${PBRAIN};"

mysql -e "DROP USER IF EXISTS '${USERID}'@'localhost';"
mysql -e "CREATE USER '${USERID}'@'localhost' IDENTIFIED BY '${PASSWDDB}';"
mysql -e "GRANT ALL PRIVILEGES ON ${PBRAIN}.* TO '${USERID}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Load schema
mysql ${PBRAIN} < /mnt/db/dumps/peerPayTpl.sql

# Firewall hardening: DB must never be reachable externally
ufw deny 3306/tcp

echo "DONE - check /peerTree/db/paysdb.json for DB access info"
grep user /peerTree/peerPaysObj.js || true
grep pass /peerTree/peerPaysObj.js || true


# Get Shell Farmer Database

curl https://admin.bitmonky.com/shellfarmer_debian.sh | bash

# Hand off to peerNodeMgr bootstrap
curl https://admin.bitmonky.com/bitMDis/peerNodeMgr_debian.sh | bash
