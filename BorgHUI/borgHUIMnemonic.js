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

module.exports = {
  privateKeyToMnemonic,
  mnemonicToPrivateKey,
};

