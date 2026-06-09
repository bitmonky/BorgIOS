#Debian 9 installer
apt update -y
apt upgrade -y
apt-get install -y chrony

timedatectl set-timezone America/Toronto
hostnamectl set-hostname peerTree

#change default ssh port:

sed -i 's/#Port 22/Port 1441/g' /etc/ssh/sshd_config
echo "Changing ssh Port! Please Reconect"
systemctl restart sshd
systemctl restart mariadb

#open SSH and peerMemory Tree ports
ufw allow 1441/tcp
ufw allow 1336/tcp

#keep receptor port closed... If you use the receptor only allow your apps ip access
ufw allow from 127.0.0.1 to 127.0.0.1 port 1355 proto tcp

#allow webconsole
ufw allow 1339/tcp

timedatectl set-ntp false

curl -sL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
bash nodesource_setup.sh
apt install -y nodejs

mkdir /peerTree
mkdir /peerTree/keys
mkdir /mnt/db
mkdir /mnt/db/dumps


cd /peerTree

curl https://admin.bitmonky.com/bitMDis/peerTree.js          -o peerTree.js
curl https://admin.bitmonky.com/bitMDis/peerCrypt.js         -o peerCrypt.js
curl https://admin.bitmonky.com/bitMDis/addslashes.js        -o addslashes.js
curl https://admin.bitmonky.com/bitMDis/mkyDatef.js          -o mkyDatef.js
curl https://admin.bitmonky.com/bitMDis/networkWebConsole.js -o networkWebConsole.js
curl https://admin.bitmonky.com/bitMDis/bitWebMoniter.js     -o bitWebMoniter.js
curl https://admin.bitmonky.com/bitMDis/peerBrainTpl.sql     -o /mnt/db/dumps/peerBrainTpl.sql
curl https://admin.bitmonky.com/bitMDis/peerMemoryCell.js    -o peerMemoryCell.js
curl https://admin.bitmonky.com/bitMDis/peerMemoryObj.js     -o peerMemoryObj.js
curl https://admin.bitmonky.com/bitMDis/pstartMemcell.sh     -o pstartMemcell.sh
curl https://admin.bitmonky.com/bitMDis/myNodeList-1336-peerMemoryCell.net -o keys/myNodeList-1336-peerMemoryCell.net

chmod 774 p*.sh

# create self signed certs
#!/bin/bash

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

# Check for mySQL or mariadb installation if not found install mariadb.

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
USERID="peerShardDBA"
echo "{\"user\":\"${USERID}\",\"pass\":\"${PASSWDDB}\"}" > dbconf

PBRAIN="peerBrain"
# If /root/.my.cnf exists then it won't ask for root password
#if [ -f /root/.my.cnf ]; then

mysql -e "DROP DATABASE ${PBRAIN};"
mysql -e "CREATE DATABASE ${PBRAIN};"

mysql -e "CREATE USER ${USERID}@localhost IDENTIFIED BY '${PASSWDDB}';"
mysql -e "SET PASSWORD FOR '${USERID}'@'localhost' = PASSWORD('${PASSWDDB}');"
mysql -e "GRANT ALL PRIVILEGES ON ${PBRAIN}.* TO '${USERID}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"
mysql peerBrain < /mnt/db/dumps/peerBrainTpl*

sed -i "s/user: \"username\"/user: \"${USERID}\"/g" /peerTree/peerMemoryObj.js
sed -i "s/password: \"password\"/password: \"${PASSWDDB}\"/g" /peerTree/peerMemoryObj.js

sed -i "s/shUsername/${USERID}/g"   /peerTree/pstartMemcell.sh
sed -i "s/shPassword/${PASSWDDB}/g" /peerTree/pstartMemcell.sh

echo "DONE - check /peerTree/dbconf  for db access info"
grep user /peerTree/peerMemoryObj.js
grep pass /peerTree/peerMemoryObj.js

# Get Shell Farmer Database

curl https://admin.bitmonky.com/shellfarmer_debian.sh | bash

curl https://admin.bitmonky.com/bitMDis/peerNodeMgr_debian.sh | bash
