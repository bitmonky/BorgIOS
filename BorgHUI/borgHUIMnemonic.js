// borgMnemonic.js
// Reversible mnemonic for a 32-byte EC private key (borgHUI identity)

const crypto = require('crypto');
const bip39 = require('bip39'); // only using the wordlist, not the seed logic

const WORDLIST = bip39.wordlists.english; // 2048 words → 11 bits per word

// ---- helpers ----

function bytesToBits(bytes) {
  let bits = '';
  for (const b of bytes) {
    bits += b.toString(2).padStart(8, '0');
  }
  return bits;
}

function bitsToBytes(bits) {
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    const chunk = bits.slice(i, i + 8);
    if (chunk.length < 8) break;
    out.push(parseInt(chunk, 2));
  }
  return Buffer.from(out);
}

function bitsToWords(bits) {
  const words = [];
  for (let i = 0; i < bits.length; i += 11) {
    const chunk = bits.slice(i, i + 11);
    if (chunk.length < 11) {
      // pad last chunk with zeros
      const padded = chunk.padEnd(11, '0');
      const idx = parseInt(padded, 2);
      words.push(WORDLIST[idx]);
      break;
    }
    const idx = parseInt(chunk, 2);
    words.push(WORDLIST[idx]);
  }
  return words;
}

function wordsToBits(words) {
  let bits = '';
  for (const w of words) {
    const idx = WORDLIST.indexOf(w);
    if (idx === -1) {
      throw new Error(`Unknown word in mnemonic: ${w}`);
    }
    bits += idx.toString(2).padStart(11, '0');
  }
  return bits;
}

// ---- core API ----

/**
 * privateKey: Buffer(32) – raw EC private key
 * returns: string – space-separated mnemonic
 */
function privateKeyToMnemonic(privateKey) {
  if (!Buffer.isBuffer(privateKey) || privateKey.length !== 32) {
    throw new Error('privateKey must be a 32-byte Buffer');
  }

  // checksum = first 4 bytes of sha256(privateKey)
  const checksum = crypto.createHash('sha256').update(privateKey).digest().subarray(0, 4);

  const payload = Buffer.concat([privateKey, checksum]); // 32 + 4 = 36 bytes = 288 bits
  const bits = bytesToBits(payload);                     // 288 bits
  const words = bitsToWords(bits);                       // 288 / 11 ≈ 26.18 → 27 words

  return words.join(' ');
}

/**
 * mnemonic: string – space-separated words
 * returns: Buffer(32) – original EC private key
 */
function mnemonicToPrivateKey(mnemonic) {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length < 26 || words.length > 27) {
    throw new Error('Unexpected mnemonic length (expected ~27 words)');
  }

  const bits = wordsToBits(words);

  // We know original payload was 288 bits (36 bytes)
  const payloadBits = bits.slice(0, 288);
  const payload = bitsToBytes(payloadBits);

  if (payload.length !== 36) {
    throw new Error('Invalid payload length after decoding');
  }

  const key = payload.subarray(0, 32);
  const checksum = payload.subarray(32, 36);

  const expectedChecksum = crypto.createHash('sha256').update(key).digest().subarray(0, 4);

  if (!checksum.equals(expectedChecksum)) {
    throw new Error('Checksum mismatch – mnemonic does not match a valid borgHUI key');
  }

  return key;
}
// Add encryption for mnemonic storage
class SecureMnemonicStorage {
    constructor(wallet) {
        this.wallet = wallet;
    }
    
    // Encrypt mnemonic before writing to disk
    encryptMnemonic(mnemonic, password) {
        const salt = crypto.randomBytes(32);
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(mnemonic, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }
    
    // Decrypt mnemonic
    decryptMnemonic(encryptedData, password) {
        const { encrypted, salt, iv, authTag } = encryptedData;
        const key = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}
module.exports = {
  privateKeyToMnemonic,
  mnemonicToPrivateKey,
};

