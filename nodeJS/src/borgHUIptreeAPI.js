// ------------------------------------------------------------
//  PTree JavaScript Port (1:1 rewrite of your PHP file)
//  CommonJS version for Node.js
// ------------------------------------------------------------

const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");

// ------------------------------------------------------------
//  GLOBAL CONFIG
// ------------------------------------------------------------

const PTC_memRECEPTOR    = "https://172.105.110.34:1335";
const PTC_shardRECEPTOR  = "https://139.177.195.184:13355";
const PTC_shardRECEPTOR2 = "https://139.177.195.184:13355";
const PTC_ftreeRECEPTOR  = "https://139.177.195.184:13381";
const PTC_mailRECEPTOR   = "https://139.177.195.184:13395";
const PTC_peerPaysRECEPTOR = "https://172.105.22.200:13392";

const PTC_maxWordLength = 45;

// ------------------------------------------------------------
//  LOW-LEVEL HTTP WRAPPERS (cURL equivalents)
// ------------------------------------------------------------

function httpRequestRaw(options, body = null, timeout = 180000) {
  return new Promise((resolve) => {
    const urlObj = new URL(options.url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : http;

    const reqOptions = {
      method: options.method || "GET",
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: options.headers || {},
      rejectUnauthorized: false,
      timeout
    };

    const req = lib.request(reqOptions, (res) => {
      let chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");

        let json = null;
        try { json = JSON.parse(raw); } catch {}

        resolve({
          error: false,
          status: res.statusCode,
          url: options.url,
          raw,
          json
        });
      });
    });

    req.on("error", (err) => {
      resolve({
        error: err.message,
        status: null,
        url: options.url,
        raw: null,
        json: null
      });
    });

    if (body) req.write(body);
    req.end();
  });
}

function postJSON(url, obj, timeout = 180000) {
  const body = JSON.stringify(obj);

  return httpRequestRaw(
    {
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    },
    body,
    timeout
  );
}

function postBinary(url, buffer, timeout = 180000) {
  return httpRequestRaw(
    {
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": buffer.length
      }
    },
    buffer,
    timeout
  );
}

function getJSON(url, timeout = 180000) {
  return httpRequestRaw(
    {
      url,
      method: "GET",
      headers: { "Accept": "application/json" }
    },
    null,
    timeout
  );
}

// ------------------------------------------------------------
//  UTILS
// ------------------------------------------------------------

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function ptreeMakeSearchKey(j) {
  return sha256(JSON.stringify(j));
}

function getFileSha256(path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(path);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function readShard(path, start, size) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(path, "r");
    const buffer = Buffer.alloc(size);

    fs.read(fd, buffer, 0, size, start, (err, bytesRead) => {
      fs.closeSync(fd);
      if (err) return reject(err);
      resolve(buffer.slice(0, bytesRead));
    });
  });
}

async function runConcurrent(jobs, limit = 20) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < jobs.length) {
      const i = index++;
      results[i] = await jobs[i]();
    }
  }

  const workers = Array.from({ length: limit }, worker);
  await Promise.all(workers);

  return results;
}

// ------------------------------------------------------------
//  BEGIN PORT OF YOUR PHP FUNCTIONS
// ------------------------------------------------------------

function locateMyMasterRepo(muid) {
  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "locateMyMasterRepo", ownMUID: muid } }
  );
}

function peerMailGetMyMsgs(muid, sig) {
  return postJSON(
    `${PTC_mailRECEPTOR}/netREQ`,
    { msg: { req: "getMyMail", ownMUID: muid, sig } }
  );
}

function peerMailSendMsg(toMuid, mail, sig) {
  return postJSON(
    `${PTC_mailRECEPTOR}/netREQ`,
    { msg: { req: "sendMail", toMUID: toMuid, sig, mail } }
  );
}

function peerMailGetInboxKey(muid) {
  return postJSON(
    `${PTC_mailRECEPTOR}/netREQ`,
    { msg: { req: "getInBoxKey", ownMUID: muid } }
  );
}

function peerPaysMakeUserTrans(muid, toMuid, amount, sig) {
  const p = {
    pacID: 1,
    to: toMuid,
    from: muid,
    amount,
    unixTime: Date.now(),
    date: new Date().toISOString().slice(0, 19).replace("T", " "),
    status: 0,
    signature: sig,
    signKey: "xxxxx"
  };

  p.tx = sha256(JSON.stringify(p));
  p.nCopies = 2;

  return postJSON(
    `${PTC_peerPaysRECEPTOR}/netREQ`,
    { msg: { req: "makeUserTransaction", userUID: muid, trans: { from: muid, payment: p } } }
  );
}

function peerPaysGetMyBalance(muid) {
  return postJSON(
    `${PTC_peerPaysRECEPTOR}/netREQ`,
    { msg: { req: "getUserBalance", userUID: muid } }
  );
}

function peerPaysGetMyTrans(muid) {
  return postJSON(
    `${PTC_peerPaysRECEPTOR}/netREQ`,
    { msg: { req: "getUserTransactions", userUID: muid } }
  );
}

function ftreeCreateRepo(muid, name, nCopys) {
  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "createRepo", repo: { from: muid, name, nCopys } } }
  );
}

function ftreeCreateRepoFolder(muid, name, folder, parent) {
  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "createRepoFolder", repo: { from: muid, name, folder, parent } } }
  );
}

function ftreeGetMyRepos(muid) {
  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "getMyRepoList", repo: { from: muid } } }
  );
}

function ftreeGetMyRepoPath(muid, name, fname, folderID) {
  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "getMyRepoFilePath", repo: { from: muid, name, fname, folderID } } }
  );
}

function ftreeGetMyRepoFiles(muid, name, parentID = null) {
  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "getMyRepoFiles", repo: { from: muid, name, parentID } } }
  );
}

function ftreeGetFileFromRepo(muid, name, file, path, folderID) {
  if (path !== "/") path = path.replace(/^\//, "");

  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "getRepoFileData", repo: { from: muid, name, file, path, folderID } } }
  );
}

function ftreeInsertFileToRepo(muid, name, file, path, folderID, nCopys) {
  if (path !== "/") path = path.replace(/^\//, "");

  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "insertRSfile", repo: { from: muid, name, file, path, folderID, nCopys } } }
  );
}

function ftreeDeleteFileFromRepo(muid, name, file, path, nCopys = 3) {
  if (path !== "/") path = path.replace(/^\//, "");

  return postJSON(
    `${PTC_ftreeRECEPTOR}/netREQ`,
    { msg: { req: "deleteRSfile", repo: { from: muid, name, file, path, nCopys } } }
  );
}

function ptreeStoreShard(muid, hash, shard, encrypt = null, nCopys = 3, expires = null) {
  const j = {
    from: muid,
    hash,
    hashID: sha256(hash + muid + Date.now()),
    data: shard,
    encrypt,
    expires,
    nCopys
  };

  return postJSON(
    `${PTC_shardRECEPTOR}/netREQ`,
    { msg: { req: "storeShard", shard: j } }
  );
}

function ptreeRequestShard(muid, hash, hashID, encrypted = null) {
  return postJSON(
    `${PTC_shardRECEPTOR}/netREQ`,
    { msg: { req: "requestShard", shard: { ownerID: muid, hash, hashID, encrypted } } }
  );
}

function ptreeDeleteShard(muid, hash, hashID, encrypted = null, nCopys = 3) {
  return postJSON(
    `${PTC_shardRECEPTOR}/netREQ`,
    { msg: { req: "deleteShard", shard: { ownerID: muid, hash, hashID, nCopys } } }
  );
}

function ptreeSearchMem(muid, str, type, scope = null, scopeID = null, qryLimit = null, qryOrder = null) {
  const j = {
    ownerID: muid,
    qryStr: str,
    qryType: type,
    qryStyle: "bestMatch",
    timestamp: Math.floor(Date.now() / 1000),
    reqScore: 0.0005,
    nResults: 100,
    nRows: 15,
    pg: 1,
    qryLimit: qryLimit || " limit 40"
  };

  if (scope) {
    j.scope = scope.replace("my", "").toLowerCase();
    j.scopeID = scopeID;
  }

  if (qryOrder) j.qryOrder = qryOrder;

  j.key = ptreeMakeSearchKey(j);

  const encoded = encodeURIComponent(JSON.stringify({ req: "searchMemory", qry: j }));

  return getJSON(`${PTC_memRECEPTOR}/netREQ/msg=${encoded}`);
}

function ptreeStoreMem(muid, acID, str, type = "generic", nCopys = 3, weights = null, location = null) {
  const j = {
    from: muid,
    memID: acID,
    memStr: str,
    memType: type,
    nCopys,
    weights
  };

  if (location) {
    Object.assign(j, location);
  }

  const encoded = encodeURIComponent(JSON.stringify({ req: "storeMemory", memory: j }));

  return getJSON(`${PTC_memRECEPTOR}/netREQ/msg=${encoded}`);
}

function ptreeDeleteMem(muid, memHash) {
  return postJSON(
    `${PTC_shardRECEPTOR}/netREQ`,
    { msg: { req: "removeMemory", memory: { ownMUID: muid, memoryID: memHash, nCopys: 0 } } }
  );
}

// ------------------------------------------------------------
//  FILE SHARDING + FAST STORE PIPELINE
// ------------------------------------------------------------

async function mapFileForSharding(fname, chunkSize) {
  const handle = fs.openSync(fname, "r");
  const stats = fs.statSync(fname);

  const shards = [];
  let index = 0;
  let pos = 0;

  while (pos < stats.size) {
    const size = Math.min(chunkSize, stats.size - pos);
    const buffer = Buffer.alloc(size);

    fs.readSync(handle, buffer, 0, size, pos);

    const shardID = sha256(buffer);
    const shardHID = sha256(shardID + pos + fname + Date.now());

    shards.push({
      Result: false,
      shardID,
      shardHID,
      startPos: pos,
      nStored: 0,
      index,
      hosts: []
    });

    pos += size;
    index++;
  }

  return { result: true, shards, fhandle: fname };
}

async function selectShardReceptors(muid, nReceptors) {
  const res = await postJSON(
    `${PTC_shardRECEPTOR}/netREQ`,
    { msg: { req: "selectEndPoints", shard: { from: muid, nCopys: nReceptors } } }
  );

  if (res.json && res.json.result === "listOK" && Array.isArray(res.json.useReceptors)) {
    return res.json.useReceptors;
  }

  return [];
}

async function fastStoreFile(
  muid,
  shards,
  fname,
  chunkSize,
  pass,
  maxConcurrentRequests = 25,
  nCopys = 3,
  encrypt = null,
  expires = null
) {
  const receptors = await selectShardReceptors(muid, 5);
  const defaultEndpoint = PTC_shardRECEPTOR;

  const jobs = [];

  for (const shard of shards) {
    const pending = nCopys - shard.nStored;
    if (pending <= 0) continue;

    const endpoint =
      receptors.length > 0
        ? receptors[Math.floor(Math.random() * receptors.length)]
        : defaultEndpoint;

    const shardData = await readShard(fname, shard.startPos, chunkSize);

    const url =
      `${endpoint}/storeShard/` +
      `?hash=${encodeURIComponent(shard.shardID)}` +
      `&hashID=${encodeURIComponent(shard.shardHID)}` +
      `&encrypt=${encrypt}` +
      `&expires=${expires}` +
      `&nCopys=${pending}` +
      `&pass=${pass}` +
      `&fptr=${shard.startPos}` +
      `&index=${shard.index}` +
      `&from=${encodeURIComponent(muid)}`;

    jobs.push(async () => {
      const res = await postBinary(url, shardData);

      if (res.json && res.json.result && res.json.shardID) {
        if (res.json.shardID === shard.shardID) {
          shard.Result = res.json.result;
          shard.nStored += res.json.nStored || 0;
          shard.hosts.push(...(res.json.hosts || []));
        }
      }

      return res;
    });
  }

  return runConcurrent(jobs, maxConcurrentRequests);
}

// ------------------------------------------------------------
//  FAST DELETE PIPELINE
// ------------------------------------------------------------

async function fastDeleteFileShards(
  muid,
  fmap,
  maxConcurrentRequests = 20,
  tracker = []
) {
  const jobs = [];

  for (const shard of fmap) {
    const body = {
      msg: {
        req: "deleteShard",
        shard: {
          ownerID: muid,
          hash: shard.shardID,
          hashID: shard.shardHID,
          nCopys: 0
        }
      }
    };

    jobs.push(async () => {
      const res = await postJSON(`${PTC_shardRECEPTOR}/netREQ`, body);

      if (res.json && res.json.result === "deleted") {
        tracker.push(shard.shardID);
      }

      return res;
    });
  }

  return runConcurrent(jobs, maxConcurrentRequests);
}

async function fastDeleteShardsMultyTry(
  muid,
  fmap,
  maxConnections = 25,
  maxTries = 25,
  fname = "failedUpLoadBackout.shards"
) {
  let tempShards = [...fmap];
  const tracker = [];

  let tries = 1;

  while (tempShards.length > 0 && tries <= maxTries) {
    await fastDeleteFileShards(muid, tempShards, maxConnections, tracker);

    tempShards = tempShards.filter(
      (s) => !tracker.includes(s.shardID)
    );

    tries++;
  }

  console.log(`Message From Borg: File ${fname} Deleted`);
  return 0;
}
function sayHello(){
  console.log(`borgHUIptreeAPI:: say hello`);
}
// ------------------------------------------------------------
//  EXPORTS (CommonJS)
// ------------------------------------------------------------

module.exports = {
  // utils
  sayHello,
  sha256,
  httpRequestRaw,
  postJSON,
  postBinary,
  getJSON,
  runConcurrent,
  getFileSha256,
  readShard,
  ptreeMakeSearchKey,

  // ftree
  ftreeCreateRepo,
  ftreeCreateRepoFolder,
  ftreeGetMyRepos,
  ftreeGetMyRepoPath,
  ftreeGetMyRepoFiles,
  ftreeInsertFileToRepo,
  ftreeDeleteFileFromRepo,
  ftreeGetFileFromRepo,

  // shard
  ptreeStoreShard,
  ptreeRequestShard,
  ptreeDeleteShard,
  mapFileForSharding,
  fastStoreFile,
  fastDeleteFileShards,
  fastDeleteShardsMultyTry,
  selectShardReceptors,

  // memory
  ptreeSearchMem,
  ptreeStoreMem,
  ptreeDeleteMem,

  // mail
  peerMailGetMyMsgs,
  peerMailSendMsg,
  peerMailGetInboxKey,

  // peerPays
  peerPaysMakeUserTrans,
  peerPaysGetMyBalance,
  peerPaysGetMyTrans,

  // misc
  locateMyMasterRepo
};
