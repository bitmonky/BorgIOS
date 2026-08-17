#Debian/ubuntu - PeerPays installer
apt update -y
apt upgrade -y

# Make sure hostname has a /etc/hosts entry.

sudo sed -i '/^127\.0\.1\.1[[:space:]]*'"$(hostname)"'$/!{/^127\.0\.0\.1[[:space:]]*localhost/ s/$/ '"$(hostname)"'/}' /etc/hosts

apt install systemd-timesyncd -y
apt-get install -y chrony

timedatectl set-ntp true
systemctl restart systemd-timesyncd

timedatectl set-timezone America/Toronto
hostnamectl set-hostname shardTree

#change default ssh port:

sed -i 's/#Port 22/Port 1441/g' /etc/ssh/sshd_config
echo "Changing ssh Port! Please Reconect"
systemctl restart sshd
systemctl restart mariadb

#Open SSH and ShardNet PeerTree Ports
#keep receptor port closed... If you use the receptor only allow your apps ip access

#peerPay Ports
ufw allow 13390/tcp  
ufw allow 13391/tcp
ufw allow 13392/tcp

timedatectl set-ntp false

curl -sL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
bash nodesource_setup.sh
apt install -y nodejs

mkdir /peerTree
mkdir /peerTree/keys
mkdir /peerTree/ftree
mkdir /mnt/db
mkdir /mnt/db/dumps

cd /peerTree

curl https://admin.bitmonky.com/bitMDis/peerTree.js          -o peerTree.js
curl https://admin.bitmonky.com/bitMDis/sFarmAccountant.js  -o sFarmAccountant.js
curl https://admin.bitmonky.com/bitMDis/peerCrypt.js         -o peerCrypt.js
curl https://admin.bitmonky.com/bitMDis/addslashes.js        -o addslashes.js
curl https://admin.bitmonky.com/bitMDis/mkyDatef.js          -o mkyDatef.js
curl https://admin.bitmonky.com/bitMDis/networkWebConsole.js -o networkWebConsole.js
curl https://admin.bitmonky.com/bitMDis/bitWebMoniter.js     -o bitWebMoniter.js
curl https://admin.bitmonky.com/bitMDis/peerPaysCell.js      -o peerPaysCell.js
curl https://admin.bitmonky.com/bitMDis/peerPaysObj.js       -o peerPaysObj.js
curl https://admin.bitmonky.com/bitMDis/pstartPayscell.sh    -o pstartPayscell.sh
curl https://admin.bitmonky.com/bitMDis/peerPayTpl.sql       -o /mnt/db/dumps/peerPayTpl.sql
curl https://admin.bitmonky.com/bitMDis/myNodeList-13390-peerPay.net o/keys/myNodeList-13390-peerPay.net

chmod 774 p*.sh

# Create the 'keys/' directory if it doesn't exist
mkdir -p keys

# Generate a private key
openssl genrsa -out keys/private.key 2048

# Generate a certificate signing request (CSR)
openssl req -new -key keys/private.key -out keys/certificate.csr -subj "/CN=localhost"

# Generate a self-signed certificate
openssl x509 -req -days 365 -in keys/certificate.csr -signkey keys/private.key -out keys/certificate.crt

# Clean up the CSR file (optional)
rm keys/certificate.csr

echo "SSL certificates generated and stored in 'keys/' folder."

mv keys/private.key keys/privkey.pem
mv keys/certificate.crt keys/fullchain.pem

chmod 644 keys/fullchain.pem
chmod 600 keys/privkey.pem

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

# Check if MySQL or MariaDB is installed
if is_installed "mysql-server" || is_installed "mariadb-server"; then
    echo "MySQL or MariaDB is already installed."
else
    echo "Neither MySQL nor MariaDB is installed. Installing MariaDB..."

    # Update package list
    sudo apt-get update

    # Install MariaDB
    sudo apt-get install -y mariadb-server

    # Check if installation was successful
    if is_installed "mariadb-server"; then
        echo "MariaDB installed successfully."
    else
        echo "Failed to install MariaDB."
        exit 1
    fi
fi

# create random password
PASSWDDB="$(openssl rand -hex 18)"
USERID="peerPaysDBA"

echo "{\"user\":\"${USERID}\",\"pass\":\"${PASSWDDB}\"}" > paysdbconf

PBRAIN="peerPay"

mysql -e "DROP DATABASE ${PBRAIN};"
mysql -e "CREATE DATABASE ${PBRAIN};"

mysql -e "CREATE USER ${USERID}@localhost IDENTIFIED BY '${PASSWDDB}';"
mysql -e "SET PASSWORD FOR '${USERID}'@'localhost' = '${PASSWDDB}';"
mysql -e "SET PASSWORD FOR '${USERID}'@'localhost' = PASSWORD('${PASSWDDB}');"
mysql -e "GRANT ALL PRIVILEGES ON ${PBRAIN}.* TO '${USERID}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

mysql peerPay      < /mnt/db/dumps/peerPayTpl*

echo "DONE - check /peerTree/paysdbconf  for db access info"
grep user /peerTree/peerPaysObj.js
grep pass /peerTree/peerPaysObj.js


# Get Shell Farmer Database

curl https://admin.bitmonky.com/shellfarmer_debian.sh | bash

curl https://admin.bitmonky.com/bitMDis/peerNodeMgr_debian.sh | bash
