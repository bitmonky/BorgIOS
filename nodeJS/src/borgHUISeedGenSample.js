const { privateKeyToMnemonic, mnemonicToPrivateKey } = require('./borgHUIMnemonic');
const crypto = require('crypto');
const bs58check = require('bs58check');
const RIPEMD160 = require('ripemd160');

// Example: generate a new EC key (secp256k1) and back it up
function generateBorgKey() {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.generateKeys();
  const priv = ecdh.getPrivateKey(); // 32 bytes
  return priv;
}

const privKey = generateBorgKey();
const mnemonic = privateKeyToMnemonic(privKey);
//console.log('mnemonic:', mnemonic);

const restored = mnemonicToPrivateKey(mnemonic);
//console.log('restored equals original?', restored.equals(privKey));

function hash160(buffer) {
  const sha = crypto.createHash('sha256').update(buffer).digest();
  const ripe = new RIPEMD160().update(sha).digest();
  return ripe; // 20 bytes
}

// ---- 1. Generate a secp256k1 keypair ----
function generateECKeypair() {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.generateKeys();

  const privateKey = Buffer.from('5fa8f0f782cb0d144c5022e3ce40d7a46e33097372e6799b8208aa22fcc35d31','hex'); //ecdh.getPrivateKey();              // 32 bytes
  const publicKey = ecdh.getPublicKey(null, 'compressed'); // 33 bytes
  console.log(privateKey);
  return { privateKey, publicKey };
}

// ---- 2. Hash public key → SHA256 then RIPEMD160 ----
function hash160(buffer) {
  const sha = crypto.createHash('sha256').update(buffer).digest();
  const ripe = new RIPEMD160().update(sha).digest();
  return ripe; // 20 bytes
}

// ---- 3. Convert to Bitcoin-style P2PKH address ----
function publicKeyToAddress(publicKey) {
  const pubKeyHash = hash160(publicKey); // 20 bytes

  // Version byte 0x00 = mainnet P2PKH (Bitcoin-style)
  const versionedPayload = Buffer.concat([Buffer.from([0x00]), pubKeyHash]);

  // Base58Check handles checksum automatically
  const address = bs58check.encode(versionedPayload);

  return address;
}

function privateKeyToPublicKey(privateKeyBuffer) {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(privateKeyBuffer);
  return ecdh.getPublicKey(null, 'compressed'); // returns Buffer
}

// ---- Example usage ----
function exampleOld() {
  const { privateKey, publicKey } = generateECKeypair();

  console.log("Private Key (hex):", privateKey.toString('hex'));
  console.log("Public Key (hex): ", publicKey.toString('hex'));

  const address = publicKeyToAddress(publicKey);
  console.log("Bitcoin-like Address:", address);

  return { privateKey, publicKey, address };
}
function example() {
  // 1. Generate a fresh EC keypair
  const { privateKey, publicKey } = generateECKeypair();

  console.log("Private Key (hex):", privateKey.toString('hex'));
  console.log("Public Key (hex): ", publicKey.toString('hex'));

  // 2. Convert private key → BORG-native seed phrase
  const seedPhrase = privateKeyToMnemonic(privateKey);
  console.log("Seed Phrase:", seedPhrase);

  // 3. Convert seed phrase → private key (restore)
  const restoredPrivateKey = mnemonicToPrivateKey(seedPhrase);
  console.log("Restored Private Key (hex):", restoredPrivateKey.toString('hex'));

  // 4. Regenerate public key from restored private key
  const restoredPublicKey = privateKeyToPublicKey(restoredPrivateKey);
  console.log("Restored Public Key (hex):", restoredPublicKey.toString('hex'));

  // 5. Derive address from restored public key
  const restoredAddress = publicKeyToAddress(restoredPublicKey);
  console.log("Restored Address:", restoredAddress);

  return {
    privateKey,
    publicKey,
    seedPhrase,
    restoredPrivateKey,
    restoredPublicKey,
    restoredAddress
  };
}

example();
