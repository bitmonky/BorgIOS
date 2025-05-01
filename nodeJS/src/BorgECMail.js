/*
Provides Asymmetric encryption for sending encrypted email messages
to be stored on the peerTree network.
*/

var crypto = require("crypto");
var path = require("path");
var fs = require("fs");

const { writeFileSync } = require('fs')
const { generateKeyPairSync } = require('crypto')

const passphrase = "mySecret"

class BorgECMail {
  constructor(passPhrase) {
    this.ecPubFile  = 'keys/borgMailPublic.pem';
    this.ecPrvFile  = 'keys/borgMailPrivate.pem';
    this.passPhrase = passPhrase;

    if (fs.existsSync(this.ecPubFile) && fs.existsSync(this.ecPrvFile)) {
      this.myPublicKey = fs.readFileSync(this.ecPubFile, "utf8");
    } else {
      this.generateKeys();
      this.myPublicKey = fs.readFileSync(this.ecPubFile, "utf8");
    }
  }

  encryptStringWithRsaPublicKey(toEncrypt, pubKeyStr=null) {
    if (!pubKeyStr){
      pubKeyStr = this.myPublicKey;
    }
    const buffer = Buffer.from(toEncrypt);
    const encrypted = crypto.publicEncrypt(pubKeyStr, buffer);
    return encrypted.toString("base64");
  }

  decryptStringWithRsaPrivateKey(toDecrypt) {
    const absolutePath = path.resolve(this.ecPrvFile);
    const privateKey = fs.readFileSync(absolutePath, "utf8");
    const buffer = Buffer.from(toDecrypt, "base64");
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey.toString(),
        passphrase: this.passPhrase,
      },
      buffer
    );
    return decrypted.toString("utf8");
  }

  generateKeys() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: this.passPhrase,
      },
    });

    fs.writeFileSync(this.ecPrvFile, privateKey);
    fs.writeFileSync(this.ecPubFile, publicKey);
  }
}
const algorithm = 'aes-256-cbc';

class BorgMailer {
  constructor(){
  }    
  encrypt(secret, password) {
    let buffer = Buffer.from(secret);
    const { key, salt } = this.hardenPassword(password); // Use PBKDF2 to generate a strong key
    const iv = crypto.randomBytes(16); // Generate a secure IV (random for each encryption)

    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'base64'), iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);

    return { data: encrypted.toString('base64'), iv: iv.toString('base64'), salt:salt.toString('base64') };
  }
  decrypt(encryptedData, password, iv, salt) {
    encryptedData = Buffer.from(encryptedData,'base64');
    iv            = Buffer.from(iv,'base64');
    salt          = Buffer.from(salt,'base64');  
    const { key } = this.hardenPassword(password, salt); // Regenerate the key using the same password & salt
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'base64'), iv);
  
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedData, 'base64')), decipher.final()]);
    return decrypted.toString(); // Convert back to readable data
  }
  hardenPassword(password,salt=null) {
    if (!salt) salt = crypto.randomBytes(16); // Generate a random salt for additional security
    const iterations = 100000; // More iterations = stronger security
    const keyLength = 32; // AES-256 requires a 256-bit key (32 bytes)
    const digest = 'sha256'; // Hashing algorithm used in PBKDF2

    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
    return { key: derivedKey.toString('base64'), salt: salt};
  }
}
bm = new BorgMailer();

const hpass = bm.hardenPassword('1B1xrS6Xi6uhCoXcH8UzSETk81S2pmpWjQ');
console.log('1B1xrS6Xi6uhCoXcH8UzSETk81S2pmpWjQ -->',hpass,hpass.key.length);

const myPassKey = '04f59404d35e4f48e4f9e49fbc05e7276e03af12730f518a35c62d9beb9d3f76';

var ecMail = new BorgECMail(myPassKey);

let a = ecMail.encryptStringWithRsaPublicKey("hello how much longer does this make the ecrypted data?",null);
let b = ecMail.decryptStringWithRsaPrivateKey(a);
console.log(a)
console.log(b)

//console.log(ecMail.myPublicKey);


let c = bm.encrypt('what is this: This is my big fat secrect! that is what::','04f59404d35e4f48e4f9e49fbc05e7276e03af12730f518a35c62d9beb9d3f76');
console.log(c);
let d = bm.decrypt(c.data,'04f59404d35e4f48e4f9e49fbc05e7276e03af12730f518a35c62d9beb9d3f76',c.iv,c.salt);
console.log(c.toString());
console.log(d.toString());

module.exports.BorgECMail = BorgECMail;
