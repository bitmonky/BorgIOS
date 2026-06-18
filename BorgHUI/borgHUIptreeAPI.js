// borgHUIptreeAPI.js – CLEANED VERSION
// All endpoints resolved dynamically via this.net.portal.selectPortal()

const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");

function formatAmount(amount) {
  const s = String(amount);
  let [intPart, decPart = ""] = s.split(".");

  if (!intPart) intPart = "0";
  decPart = (decPart + "000000000").slice(0, 9);

  return `${intPart}.${decPart}`;
}

class BorgHUIptreeAPI {
  constructor(net) {
    this.net = net;
    this.PTC_maxWordLength = 45;
  }

  // ------------------------------------------------------------
  // INTERNAL PORTAL + HTTP HELPERS
  // ------------------------------------------------------------

  async _selectPortal(portalName) {
    const p = await this.net.portal.selectPortal(portalName);
    console.log(`_selectPortal():: `,portalName,p);
    return {
      host: p.host,
      port: p.port,
      endPoint: p.endPoint || "/netREQ/"
    };
  }

  _buildURL(service, path = "") {
    return `https://${service.host}:${service.port}${service.endPoint}${path}`;
  }

  async _httpRequestRaw(url, { method = "GET", headers = {} } = {}, body = null, timeout = 180000) {
    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const lib = urlObj.protocol === "https:" ? https : http;

      const reqOptions = {
        method,
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        headers,
        rejectUnauthorized: false,
        timeout
      };

      const req = lib.request(reqOptions, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(raw); } catch {}
          resolve({ error: false, status: res.statusCode, url, raw, json });
        });
      });

      req.on("error", (err) => {
        resolve({ error: err.message, status: null, url, raw: null, json: null });
      });

      if (body) req.write(body);
      req.end();
    });
  }

  async _postJSON(portalName, msgObj) {
    const service = await this._selectPortal(portalName);
    const url = this._buildURL(service);

    msgObj.borgToken = this.net.wallet.getBorgToken();

    const body = JSON.stringify(msgObj);
    //console.log(`url`,url,`body`,msgObj);
    return this._httpRequestRaw(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      body
    );
  }

  async _getJSON(portalName, encodedMsg) {
    const service = await this._selectPortal(portalName);
    const url = `${this._buildURL(service)}?msg=${encodedMsg}`;

    return this._httpRequestRaw(
      url,
      {
        method: "GET",
        headers: { "Accept": "application/json" }
      }
    );
  }

  async _postBinary(portalName, path, buffer) {
    const service = await this._selectPortal(portalName);
    const url = `https://${service.host}:${service.port}${path}`;

    return this._httpRequestRaw(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": buffer.length
        }
      },
      buffer
    );
  }

  // ------------------------------------------------------------
  // UTILS
  // ------------------------------------------------------------

  sha256(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  ptreeMakeSearchKey(j) {
    return this.sha256(JSON.stringify(j));
  }

  getFileSha256(path) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(path);

      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  readShard(path, start, size) {
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

  async runConcurrent(jobs, limit = 20) {
    const results = [];
    let index = 0;

    const worker = async () => {
      while (index < jobs.length) {
        const i = index++;
        results[i] = await jobs[i]();
      }
    };

    await Promise.all(Array.from({ length: limit }, worker));
    return results;
  }

  sayHello() {
    console.log("borgHUIptreeAPI:: say hello");
  }

  async peerPaysCreateOpeningBalance(muid) {
    const unixTime = Date.now();

    const payment = {
      pacID    : 1,
      to       : muid,
      from     : muid,
      amount   : formatAmount(0),
      unixTime : unixTime,
      date     : new Date(unixTime).toISOString().replace('T', ' ').replace('Z', ''),
    };

    // Compute tx hash
    const txHash = await this.net.wallet.calculateHash(JSON.stringify(payment));
 
    const auth = {
      tx        : txHash,
      signature : this.net.wallet.signToken(JSON.stringify(payment)),
      pubKey    : this.net.wallet.publicKey,
    }
    console.log(`peerPaysCreateOpeningBalanc():: `,auth,JSON.stringify(payment));
    const trans = {
      from    : muid,
      payment : payment,
      auth    : auth,
      status    : 0,
      nCopies   : 3
    };

    return this._postJSON("peerPaysCell", {
      msg: {
        req: "createOpeningBalance",
        trans: trans
      }
    });
  }
  async peerPaysMakeUserTrans(fromMuid, toMuid, amount) {
    const unixTime = Date.now();
    const payment = {
      pacID    : 1,
      to       : toMuid,
      from     : fromMuid,
      amount   : formatAmount(amount),
      unixTime : unixTime,
      date     : new Date(unixTime).toISOString().replace('T', ' ').replace('Z', ''),
    };

    // Compute tx hash 
    const txHash = await this.net.wallet.calculateHash(JSON.stringify(payment));

    const auth = {
      tx        : txHash,
      signature : this.net.wallet.signToken(JSON.stringify(payment)),
      pubKey    : this.net.wallet.publicKey,
    }

    const trans = {
      from    : fromMuid,
      payment : payment,
      auth    : auth,
      status  : 0,
      nCopies : 3
    };

    return this._postJSON("peerPaysCell", {
      msg: {
        req: "makeUserTransaction",
        trans: trans
      }
    });
  }
  async peerPaysGetMyBalance(muid) {
    return this._postJSON("peerPaysCell", {
      msg: { req: "getUserBalance", userUID: muid }
    });
  }

  async peerPaysGetMyTrans(muid) {
    return this._postJSON("peerPaysCell", {
      msg: { req: "getUserTransactions", userUID: muid }
    });
  }
  // ------------------------------------------------------------
  // FTREE (FILE TREE)
  // ------------------------------------------------------------

  async locateMyMasterRepo(muid) {
    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "locateMyMasterRepo", ownMUID: muid }
    });
  }

  async ftreeCreateRepo(muid, name, nCopys) {
    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "createRepo", repo: { from: muid, name, nCopys } }
    });
  }

  async mailTreeRegisterBorgUser(msg) {
    return this._postJSON("mailTreeCell",{msg:msg});
  }
  async ftreeCreateRepoFolder(muid, name, folder, parent) {
    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "createRepoFolder", repo: { from: muid, name, folder, parent } }
    });
  }

  async ftreeGetMyRepos(muid) {
     const borgMasterUID = this.net.borgMasterID;
    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "getMyRepoList", borgMasterUID:borgMasterUID,repo: { from: muid } }
    });
  }

  async ftreeGetMyRepoPath(muid, name, fname, folderID) {
    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "getMyRepoFilePath", repo: { from: muid, name, fname, folderID } }
    });
  }

  async ftreeGetMyRepoFiles(muid, name, parentID = null) {
    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "getMyRepoFiles", repo: { from: muid, name, parentID } }
    });
  }

  async ftreeGetFileFromRepo(muid, name, file, path, folderID) {
    if (!path) path = "/";
    if (path !== "/") path = path.replace(/^\//, "");
    if (path === "") path = "/";

    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "getRepoFileData", repo: { from: muid, name, file, path, folderID } }
    });
  }

  async ftreeInsertFileToRepo(muid, name, file, path, folderID, nCopys) {
    if (path !== "/") path = path.replace(/^\//, "");
    if (path === "") path = "/";

    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "insertRSfile", repo: { from: muid, name, file, path, folderID, nCopys } }
    });
  }

  async ftreeDeleteFileFromRepo(muid, name, file, path, nCopys = 3) {
    if (path !== "/") path = path.replace(/^\//, "");

    return this._postJSON("ftreeFileMgrCell", {
      msg: { req: "deleteRSfile", repo: { from: muid, name, file, path, nCopys } }
    });
  }

  // ------------------------------------------------------------
  // SHARD OPS
  // ------------------------------------------------------------

  async ptreeStoreShard(muid, hash, shard, encrypt = null, nCopys = 3, expires = null) {
    const j = {
      from: muid,
      hash,
      hashID: this.sha256(hash + muid + Date.now()),
      data: shard,
      encrypt,
      expires,
      nCopys
    };

    return this._postJSON("shardTreeCell", {
      msg: { req: "storeShard", shard: j }
    });
  }

  async ptreeRequestShard(muid, hash, hashID, encrypted = null) {
    return this._postJSON("shardTreeCell", {
      msg: { req: "requestShard", shard: { ownerID: muid, hash, hashID, encrypted } }
    });
  }

  async ptreeDeleteShard(muid, hash, hashID, encrypted = null, nCopys = 3) {
    return this._postJSON("shardTreeCell", {
      msg: { req: "deleteShard", shard: { ownerID: muid, pubKey: this.net.wallet.publicKey,hash, hashID, nCopys } }
    });
  }

  // ------------------------------------------------------------
  // MEMORY OPS
  // ------------------------------------------------------------

  async ptreeSearchMem(muid, str, type, scope = null, scopeID = null, qryLimit = null, qryOrder = null) {
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

    j.key = this.ptreeMakeSearchKey(j);

    const encoded = encodeURIComponent(JSON.stringify({ req: "searchMemory", qry: j }));
    return this._getJSON("memCell", encoded);
  }

  async ptreeStoreMem(muid, acID, str, type = "generic", nCopys = 3, weights = null, location = null) {
    const j = {
      from: muid,
      memID: acID,
      memStr: str,
      memType: type,
      nCopys,
      weights
    };

    if (location) Object.assign(j, location);

    const encoded = encodeURIComponent(JSON.stringify({ req: "storeMemory", memory: j }));
    return this._getJSON("memCell", encoded);
  }

  async ptreeDeleteMem(muid, memHash) {
    return this._postJSON("memCell", {
      msg: { req: "removeMemory", memory: { ownMUID: muid, memoryID: memHash, nCopys: 0 } }
    });
  }

  // ------------------------------------------------------------
  // FAST STORE PIPELINE
  // ------------------------------------------------------------

  async mapFileForSharding(fname, chunkSize) {
    const stats = fs.statSync(fname);
    const handle = fs.openSync(fname, "r");

    const shards = [];
    let index = 0;
    let pos = 0;

    while (pos < stats.size) {
      const size = Math.min(chunkSize, stats.size - pos);
      const buffer = Buffer.alloc(size);

      fs.readSync(handle, buffer, 0, size, pos);

      const shardID = this.sha256(buffer);
      const shardHID = this.sha256(shardID + pos + fname + Date.now());

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

    fs.closeSync(handle);
    return { result: true, shards, fhandle: fname };
  }

  async selectShardReceptors(muid, nReceptors) {
    const res = await this._postJSON("shardTreeCell", {
      msg: { req: "selectEndPoints", shard: { from: muid, nCopys: nReceptors } }
    });

    if (res.json && res.json.result === "listOK" && Array.isArray(res.json.useReceptors)) {
      return res.json.useReceptors;
    }
    return [];
  }

  async fastStoreFile(
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
    const receptors = await this.selectShardReceptors(muid, 5);
    const jobs = [];

    for (const shard of shards) {
      const pending = nCopys - shard.nStored;
      if (pending <= 0) continue;

      const endpoint = receptors.length > 0
        ? receptors[Math.floor(Math.random() * receptors.length)]
        : null;

      const shardData = await this.readShard(fname, shard.startPos, chunkSize);

      const params =
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
        if (endpoint && endpoint.host && endpoint.port) {
          const url = `https://${endpoint.host}:${endpoint.port}/storeShard/${params}`;
          const res = await this._httpRequestRaw(
            url,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": shardData.length
              }
            },
            shardData
          );

          if (res.json && res.json.result && res.json.shardID === shard.shardID) {
            shard.Result = res.json.result;
            shard.nStored += res.json.nStored || 0;
            shard.hosts.push(...(res.json.hosts || []));
          }
          return res;
        } else {
          return this._postBinary("shardTreeCell", `/storeShard/${params}`, shardData);
        }
      });
    }

    return this.runConcurrent(jobs, maxConcurrentRequests);
  }

  // ------------------------------------------------------------
  // FAST DELETE PIPELINE
  // ------------------------------------------------------------

  async fastDeleteFileShards(muid, fmap, maxConcurrentRequests = 20, tracker = []) {
    const jobs = [];

    for (const shard of fmap) {
      if (shard.nStored < 3) shard.nStored = 3;

      const body = {
        msg: {
          req: "deleteShard",
          shard: {
            ownerID: muid,
            hash: shard.shardID,
            hashID: shard.shardHID,
            nCopys: shard.nStored
          }
        }
      };

      jobs.push(async () => {
        const res = await this._postJSON("shardTreeCell", body);
        if (res.json && res.json.result == 1) {
          tracker.push(shard.shardID);
        }
        return res;
      });
    }

    return this.runConcurrent(jobs, maxConcurrentRequests);
  }

  async fastDeleteShardsMultyTry(
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
      await this.fastDeleteFileShards(muid, tempShards, maxConnections, tracker);
      tempShards = tempShards.filter((s) => !tracker.includes(s.shardID));
      tries++;
    }

    console.log(`Message From Borg: File ${fname} Deleted`);
    return 0;
  }
}

module.exports.BorgHUIptreeAPI = BorgHUIptreeAPI;

