const crypto = require("crypto");
const fs = require("fs");
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const shardSize = 256 * 1024;

class Mutex {
  constructor() {
    this._locked = false;
    this._waiters = [];
  }

  async lock() {
    if (!this._locked) {
      this._locked = true;
      return;
    }
    return new Promise(resolve => this._waiters.push(resolve));
  }

  unlock() {
    if (this._waiters.length > 0) {
      const next = this._waiters.shift();
      next();
    } else {
      this._locked = false;
    }
  }
}

class BorgHUIstreamMgr {
  constructor(net) {
    this.net = net;
    this.cell = null;
    this.streams  = new Map();   // streamId → streamMeta / conversation
    this.dstreams = new Map();
    this.memFiles = new Map();   // streamId → Buffer ( in memory file system);
    this.sentShardListener();    // start listening for sendBinShard results.
  }
  attachCell(cell){
   this.cell = cell;
   console.log('hello');
  }
  prepareTempFile(filepath, fileSize) {
    const file = filepath;

    // Remove old file if it exists
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (err) {
      console.error("Failed to remove old temp file:", err);
    }

    // Pre-allocate the file to full size
    const fd = fs.openSync(file, 'w');
    fs.ftruncateSync(fd, fileSize);
    fs.closeSync(fd);

    return file;
  }
  prepareBlobMemFile(streamId, fileSize) {

    // Remove any stale buffer
    if (this.memFiles.has(streamId)) {
      this.memFiles.delete(streamId);
    }

    // Allocate full-size buffer in RAM
    const buffer = Buffer.alloc(fileSize);

    // Store it in the memFile map
    this.memFiles.set(streamId, buffer);

    return buffer;
  }
  sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  async writeShardToFile(stream,shard) {
    const shardSize = stream.shardSize;
    const fileSize  = stream.totalSize;
    const index     = shard.shardIdx;
    const offset    = index * shardSize;
    const expectedShardId = shard.shardId;

    const remaining = fileSize - offset;
    const isFinal   = (index === stream.count - 1)

    // 1. Size validation
    if (!isFinal) {
      // Non-final shard must match shardSize exactly
      if (shard.shard.length !== shardSize) {
        console.log(`writeShardToFile():: BAD_SIZE `,shard.shard.length,shardSize);
        //return { ok: false, reason: "BAD_SIZE", index };
      }
    } else {
      // Final shard must be <= remaining bytes
      if (shard.shard.length > remaining) {
        console.log(`writeShardToFile():: BAD_SIZE_FINAL `,shard.shard.length,remaining);
        //return { ok: false, reason: "BAD_SIZE_FINAL", index };
      }
    }
    // 2. Validate shard hash
    const actualHash = this.sha256(shard.shard);
    if (actualHash !== expectedShardId) {
      console.log(`writeShardToFile():: BAD_HASH `,actualHash,expectedShardId);
      return { ok: false, reason: "BAD_HASH", index };
    }

    // 3. Random-access write
    if (stream.type === 'memFile' || stream.type === 'dsBuffer') {
      shard.shard.copy(stream.buffer, offset);
    }
    else {
      const fh = await fs.promises.open(stream.tempFilePath, 'r+');
      try {
        await fh.write(shard.shard, 0, shard.shard.length, offset);
      } finally {
        await fh.close();
      }
    }

    return { ok: true, index };
  }
  // ---------------------------------------------------------
  // Create a stream descriptor for outgoing messages
  // ---------------------------------------------------------
  async createStreamMsg(service,msg,type,winSize,nCopys=3,blob=null) {
    const filename = msg.filename;
    let streamId;
    let shards;
    
    // CASE 1: File-based stream (deterministic)
    if (type === 'file') {
      streamId = await this.getHash(msg.filename);
      shards   = await this.getShardMap(msg.filename);
    }

    // CASE 2: Blob-based stream (content-addressed)
    else if (blob) {
      streamId = this.sha256(blob);                     // deterministic for memFile/dsBuffer
      shards   = this.getBlobShardMap(blob);
    }

    // CASE 3: Memory stream without blob (rare)
    else {
      streamId = await this.getHash(msg.filename);      // small file direct to memory buffer
      shards   = await this.getShardMap(msg.filename);
    }

    const fmap = {
      service,
      streamId,
      filename,
      requestMutex: new Mutex(),
      reqId       : msg.reqId,
      shardSize   : shards.shardSize,
      shardHashes : shards.shardHashes,
      count       : shards.count,
      totalSize   : shards.totalSize,
      type        : type,
      winSize     : winSize,
      nCopys      : nCopys,

      // State machine
      status      : "metaDataSent",   // metaDataSent → metaDataACK → transferring → completed
      acked       : false,
      completed   : false,

      // Progress
      shardsSent    : 0,
      pendingShards : new Set([...Array(shards.count).keys()]),
      inFlight      : new Set(),
      shardsSentOK  : new Map(),
      inProgress    : false,

      // Diagnostics
      sentAt      : Date.now()
    };

    if (blob) {
      fmap.buffer = streamId;
      this.memFiles.set(streamId,blob);
    }
    this.streams.set(streamId, fmap);

    return {
      streamId,
      shardSize: fmap.shardSize,
      shardHashes : fmap.shardHashes,
      count       : fmap.count,
      totalSize   : fmap.totalSize,
      type        : type,
      winSize     : winSize,
      filename
    };
  }

  // ---------------------------------------------------------
  // Send a normal PeerTree message that includes a stream descriptor
  // ---------------------------------------------------------
  async streamRepoFileFrom(service,repo,httpRes){
    return await this.doOpenStream(repo,service,httpRes);
  }
  async streamFrom(service,fmap){
   // FOR TESTING ONLY!
   console.log('fig',fmap);
    fmap.pendingShards  = new Set([...Array(j.stream.count).keys()]);
    fmap.inFlight       = new Set();       // shardIdx values currently requested but not yet received
    fmap.inProgress     = true;

    // Diagnostics
    fmap.startAt       = Date.now();
    fmap.timeElapsed   = 0;
 
    // Storage
    if (fmap.type === 'memFile' || fmap.type === 'dsBuffer') {
      fmap.buffer = this.prepareBlobMemFile(fmap.streamId, fmap.totalSize);
    }
    else {
      fmap.tempFilePath = await this.prepareTempFile(`./downloads/${fmap.streamId}.tmp`, fmap.totalSize);
    }

    // Start requesting shards
    this.gatherShards(fmap);

    // Kick off the first batch of shard requests
    this.requestShardBatch(fmap.streamId,service);
  }
  streamTo(service,type = 'file',winSize = 20,nCopys=3,blob=null) {
    return new Promise(async (resolve) => {
      const reqId = crypto.randomUUID();
      const msg = {
        req      : 'openBinStream',
        filename : service.filename
      }
      msg.reqId   = reqId;

      // Create stream descriptor
      const stream = await this.createStreamMsg(service,msg,type,winSize,nCopys,blob);
      msg.stream = stream;
      let timer;
      let failListener, replyListener, sendOKListener;

      //console.log(`sendMsg():: `,msg,toIp);
      // DELIVERED PATH
      const toIp = service.host;


      // FAILURE PATH
      this.net.on('xhrFail', failListener = (j) => {
        console.log('streamTo():: xhrFail ',j);
        if (j.toHost === toIp && j.req === msg.req) {
          clearTimeout(timer);

          this.net.removeListener('xhrFail', failListener);
          this.net.removeListener('peerTReply', replyListener);
          this.net.removeListener('xhrPostOK', sendOKListener);

          this.removeStream(stream.streamId);
          resolve({ result: 'xhrFail' });
        }
      });

      // SUCCESS PATH
      this.net.on('xhrPostOK', sendOKListener = async (j) => {
        if (j.reqId === reqId) {
         console.log(`streamTo():: j.res `,j.res);
         clearTimeout(timer);

          this.net.removeListener('xhrFail', failListener);
          this.net.removeListener('xhrPostOK', sendOKListener);
          if (j.res.result === 'STREAM_META_ACK'){
            this.setStatus(stream.streamId, j.status);
            await this.doBlastShardBatch(service,stream.streamId);
          }
          else {
            console.error(`DStreamMgrObj.sendMsg():: failed to open remote stream`,j);
            this.removeStream(stream.streamId);
          } 
          resolve(j);
        }
      });
      service.endPoint = '/netREQ/';
      console.log(`streamTo():: sending msg`,service,msg);
      this.sendMsgCX(service, msg);
    });
  }
  setStatus(sId,status){
     const stream = this.streams.get(sId);
     stream.status = status;
     return;

  }
  async doBlastShardBatch(service, streamId) {
    const stream = this.streams.get(streamId);
    if (!stream) {
      console.log(`Stream not found.`,streamId);
      return;
    }
    // Nothing to do if stream is already complete
    if (stream.completed) return;

    // Fill the window
    const mutex = stream.requestMutex;
    await mutex.lock();
    try {
      console.log(`doBlastShardBatch():: pending ${stream.pendingShards.size} inFlight: ${stream.inFlight.size}`);
      while (
        stream.inFlight.size < stream.winSize &&
        stream.pendingShards.size > 0
      ) {
        // Pull next shard index
        const shardIdx = stream.pendingShards.values().next().value;
        stream.pendingShards.delete(shardIdx);

        const shard    = stream.shardHashes[shardIdx];
        const shardId  = shard.hash;
        const shardHID = this.net.wallet.calculateHash(`${shardId}-${this.net.ownMUID}-${Date.now()}`);
        const shardSig = this.net.wallet.signToken(shardHID);
        shard.hashHID  = shardHID;

        // Mark as in-flight
        stream.inFlight.add(shardIdx);

        // Dispatch the shard
        console.log(`doBlastShardBatch():: `,service, stream.streamId, shardIdx, shardId,shardHID,shardSig);
        this.sendStreamShard(service, stream.streamId, shardIdx, shardId,shardHID,shardSig);

        // Optional: status update
        this.setStatus(stream.streamId, `sending:${shardIdx}`);
      } 
    } finally {
      mutex.unlock();
    }
  }
  // ---------------------------------------------------------
  // Send a shard to a remote host
  // ---------------------------------------------------------
  async sendStreamShard(service, streamId, shardIdx,shardId,shardHID,shardSig) {
    const stream = this.streams.get(streamId);
    if (!service ) service = stream.service;

    const shard = await this.getShardData(streamId, shardIdx);
    const msg = {
      streamId : streamId,
      shardId  : shardId,
      shardIdx : shardIdx,
      reqTime  : Date.now(),
      shard    : shard,

      // Required by /storeShard/ endpoint
      hash     : shardId,                    // canonical shard hash
      hashID   : shardHID,                   // shart Identity pointer
      hashSig  : shardSig,
      opKey    : this.net.wallet.publicKey,
      encrypt  : stream.encrypt || 0,
      expires  : stream.expires || 0,
      nCopys   : stream.nCopys  || 3,
      pass     : stream.pass    || 0,
      fptr     : shardIdx*stream.shardSize,
      index    : shardIdx,
      from     : this.net.wallet.ownMUID 
    } 
     
    // Then send raw binary shard
    service.endPoint = '/storeShard/'
    this.sendBinaryShardCX(service, msg);
    this.setStatus(streamId,'transfering:'+shardId);
  }

  // ---------------------------------------------------------
  // Remove stream metadata
  // ---------------------------------------------------------
  removeStream(streamId) {
    this.memFiles.delete(streamId);
    this.streams.delete(streamId);
  }
  closeOutgoingStream(stream){
    this.removeStream(stream.streamId);
  }
  getHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);

      stream.on("data", chunk => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }
  getBlobShardMap(blob, shardSize = 256 * 1024) {

    const shardHashes = [];
    const totalSize   = blob.length;

    let offset = 0;

    while (offset < totalSize) {
      const end = Math.min(offset + shardSize, totalSize);
      const shard = blob.slice(offset, end);

      const hash = crypto.createHash("sha256")
                       .update(shard)
                       .digest("hex");

      shardHashes.push(hash);

      offset = end;
    }

    return {
      shardSize,
      shardHashes,
      count: shardHashes.length,
      totalSize
    };
  }
  getShardMap(filePath, shardSize = 256 * 1024) {
    return new Promise((resolve, reject) => {
      const shardHashes = [];
      let shardBuffer = Buffer.alloc(0);
      let totalSize = 0;

      const stream = fs.createReadStream(filePath);

      stream.on("data", chunk => {
        totalSize += chunk.length;

        // Append chunk to current shard buffer
        shardBuffer = Buffer.concat([shardBuffer, chunk]);

        // Process full shards
        while (shardBuffer.length >= shardSize) {
          const shard = shardBuffer.slice(0, shardSize);

          const hash = crypto.createHash("sha256")
                           .update(shard)
                           .digest("hex");

          shardHashes.push({hash:hash,hashHID:null});

          shardBuffer = shardBuffer.slice(shardSize);
        }
      });

      stream.on("end", () => {
        // Process final partial shard
        if (shardBuffer.length > 0) {
          const hash = crypto.createHash("sha256")
                           .update(shardBuffer)
                           .digest("hex");
          shardHashes.push({hash:hash,hashHID:null});
        }

        resolve({
          shardSize,
          shardHashes,
          count: shardHashes.length,
          totalSize
        });
      });

      stream.on("error", reject);
    });
  }
  getShardData(streamId, shardIdx) {
    return new Promise(async (resolve, reject) => {

      const stream = this.streams.get(streamId);
      if (!stream) return reject(new Error("Unknown streamId"));

      const start = shardIdx * stream.shardSize;
      const end   = Math.min(start + stream.shardSize, stream.totalSize);

      // CASE 1: memFile / dsBuffer (RAM)
      //console.log(`getShardData::() stream is `,stream);
      if (stream.hasOwnProperty('buffer') && stream.buffer !== null && (stream.type === 'memFile' || stream.type === 'dsBuffer')) {
        try {
          const slice = stream.buffer.slice(start, end);
          return resolve(slice);
        } catch (err) {
          return reject(err);
        }
      }

      // CASE 2: file (disk)
      const chunks = [];
      const fstream = fs.createReadStream(stream.filename, {
        start,
        end: end - 1   // inclusive
      });

      fstream.on("data", chunk => chunks.push(chunk));
      fstream.on("end", () => resolve(Buffer.concat(chunks)));
      fstream.on("error", reject);
    });
  }
  gatherShards(stream) {
    const handler = async (data) => {
      if (data.streamId !== stream.streamId) return;

      try {
        await this.onShardReceived({
          streamId: stream.streamId,
          shard: {
            shardId  : data.hash,
            shardIdx : data.index,
            error    : data.error,
            shard    : data.data
          }
        });
      } catch (err) {
        // If shard processing fails, close the stream
        this.closeIncomingStream(stream);
      }
    };

    this.net.on('requestBinShardOk', handler);
    stream._shardHandler = handler;
  }
  closeIncomingStream(stream) {
    // Remove shard event listener
    if (stream._shardHandler) {
      this.net.removeListener('binShard', stream._shardHandler);
      stream._shardHandler = null;
    }
    // Mark stream as completed
    stream.inProgress = false;
    stream.completed  = true;
    stream.status     = "completed";

    // Diagnostics
    stream.timeElapsed = Date.now() - stream.startAt;

    // Build local request for app layer
    const buildLocalReq = {
      req      : stream.request,
      reqId    : stream.reqId,
      remIp    : stream.remIp,
      response : stream.response,
      fileInfo : stream.filename,
      file     : stream.tempFilePath,   // for file streams
      buffer   : stream.buffer          // for memFile/dsBuffer streams
    };

    // Remove from active streams
    console.log(`Stream ${stream.streamId} completed in ${stream.timeElapsed}ms`);
    let httpRes  = stream.httpRes;
    let filePath = stream.tempFilePath;
    let mimeType = stream.mimeType;
    console.log(`closeIncomingStream():: mimeType`,mimeType);

    if (mimeType.startsWith("video/")) {
      console.log(`closeIncomingStream():: is video true`);
      for (const client of stream.videoClients) {
        console.log(`closeIncomingStream():: ending video client stream`);
        client.end();
      }
      this.dstreams.delete(stream.streamId);
      return;
    }

    // Deliver file or Buffer to the browser

    const headers = {
      "Content-Type": stream.mimeType,
      "Content-Length": stream.totalSize,
      "Accept-Ranges": "bytes"
    };

    headers["ETag"] = `"${stream.streamId}"`;
    headers["Content-Disposition"] = `inline; filename="${stream.origName}"`;

    // remove stream;
    this.dstreams.delete(stream.streamId);

    console.log(`getFileFromRepo():: Headers:`,headers);

    // Send headers
    httpRes.writeHead(200, headers);

    // Create a read stream and pipe it out
    const fileStream = fs.createReadStream(filePath);

    fileStream.on("error", err => {
      console.error("getFileFromRepo():: File read error:", err);
      httpRes.writeHead(500);
      httpRes.end("File read error");
    });

    // Pipe file to client
    fileStream.pipe(httpRes);
  }
  async doOpenStream(repo,service,httpRes,winSize=20) {
    let j = repo.file;
    let shards = [];
    j.shards.forEach( (shard) => shards.push(shard.shardID));
    const input = j.filename;
    const origName = input.split('/').pop();

    const fmap = {
      httpRes      : httpRes,
      requestMutex : new Mutex(), 
      videoClients : [],
      videoShardBuffer  : new Map(), // idx -> Buffer
      nextToSend   : 0,
      service      : service,
      streamId     : j.fileInfo.checkSum,
      filename     : service.filename,
      origName     : origName,
      mimeType     : j.fileInfo.fileType,
      reqId        : crypto.randomUUID(),
      response     : 'na',
      request      : 'sendShard',
      shardSize    : j.fileInfo.shardSize,
      shardHashes  : shards,
      count        : shards.length,
      totalSize    : j.fileInfo.fileSize,
      type         : 'file',

      // State machine
      status      : "readyForShards",
      acked       : true,
      completed   : false,

      // Progress
      shardsReceived : 0,
      pendingShards  : new Set([...Array(shards.length).keys()]),
      inFlight: new Set(),           // shardIdx values currently requested but not yet received
      windowSize     : winSize ,     // or 8, or dynamic later
      inProgress     : true,

      // Diagnostics
      startAt       : Date.now(),
      timeElapsed   : 0,
    };
    

    // Storage
    if (fmap.type === 'memFile' || fmap.type === 'dsBuffer') {
      fmap.buffer = this.prepareBlobMemFile(fmap.streamId, fmap.totalSize);
    }
    else {
      fmap.tempFilePath = await this.prepareTempFile(fmap.filename, fmap.totalSize);
    }
    if (fmap.mimeType.startsWith("video/")) {
       console.log(`doOpenStream():: is video: sending response headers`);
       fmap.videoClients.push(httpRes);
       httpRes.writeHead(200, {
         "Content-Type": fmap.mimeType,
         "Transfer-Encoding": "chunked",
         "Accept-Ranges": "bytes"
       });
    }
    this.dstreams.set(fmap.streamId, fmap);

    // Start requesting shards
    this.gatherShards(fmap);

    // Kick off the first batch of shard requests
    this.requestShardBatch(fmap.streamId,service);
    return fmap;
  }
  async requestShardBatch(streamId,service) {
    const stream = this.dstreams.get(streamId);
    //console.log(`requestShardBatch():: stream`,stream);
    if (!stream) return;

    // If nothing left, close stream
    if (stream.pendingShards.size === 0 && stream.inFlight.size === 0) {
      return;
    }

    const mutex = stream.requestMutex;
    await mutex.lock();
    try {
      // Fill the window
      console.log(`requestShardBatch():: pending ${stream.pendingShards.size} inFlight: ${stream.inFlight.size}`);
      while (
        stream.inFlight.size < stream.windowSize &&
        stream.pendingShards.size > 0
      ) {
        const shardIdx = this.getLowestPendingShard(stream.pendingShards);
        if (shardIdx === null) return;

        // Move shard from pending → inFlight
        stream.pendingShards.delete(shardIdx);
        stream.inFlight.add(shardIdx);

        const msg = {
          req       : "requestShard",
          sIndex    : shardIdx,
          shard : {
            streamId  : streamId,
            ownerID   : this.net.wallet.ownMUID,
            hash      : stream.shardHashes[shardIdx],
            encrypted : 0,
            shardSize : stream.shardSize
          }
        };
        // console.log(`requestShardBatch():: sending `,shardIdx,stream.shardHashes[shardIdx]);
        this.sendMsgCX(service, msg);
      }
    } finally {
      mutex.unlock();
    }
  }
  getLowestPendingShard(pendingShards) {
    let lowest = Infinity;
    for (const idx of pendingShards) {
      if (idx < lowest) lowest = idx;
    }
    return lowest === Infinity ? null : lowest;
  }
  async onShardReceived(j) {
    const { streamId, shard } = j;
    const stream = this.dstreams.get(streamId);
    if (!stream) return;
    if (shard.shard === null){
      //?X should count failed tries here;
      console.log(`onShardReceived():: shard req error ${shard.shardId} ${shard.shardIdx} ${shard.error}`);
      stream.inFlight.delete(shard.shardIdx);
      stream.pendingShards.add(shard.shardIdx);
      this.requestShardBatch(streamId,stream.service);
      return;
    }
    const idx = shard.shardIdx;

    // 0. Ensure this shard was expected
    if (!stream.inFlight.has(idx)) {
      // Unexpected shard — ignore or log
      console.warn(`Shard ${idx} for stream ${streamId} not in flight`);
      return;
    }

    // Remove from inFlight
    stream.inFlight.delete(idx);

    // 1. Validate + write shard
    console.log(`onShardReceived():: writing to file ${shard.shardIdx} ${shard.shardId}`);

    // If this is a video send shard directly to video

    // 1b. If this is a video stream, buffer by index
    if (stream.mimeType.startsWith("video/")) {
      const idx = shard.shardIdx;

      // store this shard’s bytes
      stream.videoShardBuffer.set(idx, shard.shard);
      
      console.log(stream.nextToSend,stream.videoShardBuffer);
      // try to flush in order starting from nextToSend
      while (stream.videoShardBuffer.has(stream.nextToSend)) {
        const chunk = stream.videoShardBuffer.get(stream.nextToSend);
        stream.videoShardBuffer.delete(stream.nextToSend);

        for (const client of stream.videoClients) {
          try {
            console.log(`onShardReceived():: write shard to media player`,stream.nextToSend);
            client.write(chunk);
          } catch (err) {
            console.warn("Video client disconnected", err);
          }
        }
        stream.nextToSend++;
      }
    }

    const result = await this.writeShardToFile(stream,shard);
    if (!result.ok) {
      console.warn(
        `Shard ${idx} rejected for stream ${streamId}: ${result.reason}`
      );

      // Re-request this shard
      stream.pendingShards.add(idx);

      // Continue filling the window
      this.requestShardBatch(streamId,stream.service);
      return;
    }

    // 2. Mark shard as completed
    stream.shardsReceived++;

    // 3. If all shards done, close stream
    if (
      stream.shardsReceived === stream.count &&
      stream.inFlight.size === 0 &&
      stream.pendingShards.size === 0
    ) {
      console.log(`onShardReceived():: closeIncomingStream`);
      return this.closeIncomingStream(stream);
    }

    // 4. Otherwise request more shards
    //console.log(`requestShardBatch():: (${streamId}.${stream.service}`);
    this.requestShardBatch(streamId,stream.service);
  }
  sentShardListener(){
    this.net.on('xhrBinShardOK',(shard) =>{
      const stream = this.streams.get(shard.streamId);
      if (!stream) {
        return;
      }
      this.onShardSentACK(shard.service,stream,shard);
    });
    this.net.on('xhrBinShardFailed',(shard) =>{
      const stream = this.streams.get(shard.streamId);
      if (!stream) {
        return;
      }
      this.onShardSentACK(shard.service,stream,shard);
    });
  }
  async onShardSentACK(service,stream,shard) {
    const { streamId, index } = shard;
    if (!stream) return;

    // 0. Ensure this shard was actually in flight
    if (!stream.inFlight.has(index)) {
      console.warn(`ACK for shard ${index} of ${streamId} not in flight`);
      return;
     }
     console.log(`onShardSentACK():: shard: ${shard.hash} result ${shard.nCopys} stored`);
     // 1. Remove from inFlight
     stream.inFlight.delete(index);

     // 2. Mark shard as completed
     stream.shardsSentOK.set(index,{shardId:shard.hash,nCopys:shard.nCopys,excTime:Date.now() - shard.reqTime});

     // 3. If all shards done, close stream
     if (
       stream.shardsSentOK.size === stream.count &&
       stream.inFlight.size === 0 &&
       stream.pendingShards.size === 0
     ) {
       console.log(`onShardSentACK():: closeOutgoingStream: elasped Time`,Date.now() - stream.sentAt);
       const yellow = s => `\x1b[33m${s}\x1b[0m`;
       const green  = s => `\x1b[32m${s}\x1b[0m`;

       [...stream.shardsSentOK.entries()]
       .sort((a, b) => a[0] - b[0])   // sort by shard index
       .forEach(([index, info]) => {
          console.log(`${yellow(`shard ${index}`)}: ` +  `shardId=${green(info.shardId)}, ` +  `copies=${info.nCopys}, time=${info.excTime}ms`);
       });
       this.net.emit(`streamToSTreeOK:${streamId}`);
       return this.closeOutgoingStream(stream);
     }

     // 4. Otherwise send more shards
     this.doBlastShardBatch(service, stream.streamId);
  }
  uploadResult(reqStreamId){
    return new Promise( (resolve) => {
      this.net.once(`streamToSTreeOK:${reqStreamId}`, () =>{
        resolve(reqStreamId);
      });
    });
  }
  sendMsgCX(service,msg){

     const endPoint = service.endPoint;
     const toHost   = service.host;
     const https    = require('https');

     msg.errCount = 0;
     msg.sentTime = Date.now();
     msg.service  = service;

     const pmsg = {msg : msg}
     const data = JSON.stringify(pmsg);

     var emitError = null;
     const options = {
       hostname : toHost,
       port     : service.port,
       path     : endPoint,
       method: 'POST',
       headers: {
         'Connection': 'close',
         'Content-Type': 'application/json',
         'Content-Length': Buffer.byteLength(data, 'utf8')
       },
       timeout: 23000
     }

     const req = https.request(options, res => {
       let chunks = [];
       res.on('data', (chunk)=>{
         chunks.push(chunk);
       });

       res.on('end',async ()=>{
         const body = Buffer.concat(chunks);

         msg.toHost = toHost;
         if (res.statusCode !== 200) {
           msg.toHost   = toHost;
           msg.endpoint = options.path;
           msg.xhrError = res.statusCode;
           msg.errCount++;
           if (msg.req === 'requestShard'){
             this.procAsShard(msg);
             return;
           }
           this.net.emit('xhrFail',msg);
         } else {
           if (msg.req === 'requestShard'){
             let shard   = msg.shard;
             shard.index = msg.sIndex;
             let reqEr = this.extractJSONIfPresent(body);
             if (reqEr){
               shard.error = reqEr;
               shard.data  = null;            
             } else {
               shard.data  = body;
             }
             this.net.emit('requestBinShardOk',shard);
             return;
           }
           try {
             msg.res = JSON.parse(body);
             this.net.emit('xhrPostOK',msg);
           }
           catch(e) {
             msg.xhrError = 'jsonParse';
             msg.errMsg   = e;
             msg.toHost   = toHost;
             if (msg.req === 'requestShard'){
               this.procAsShard(msg);
               return;
             }
             this.net.emit('xhrFail',msg);
           }
         }
       });

     });

     req.on("timeout", () => {
       if (emitError === null){
          emitError    = true;
          msg.toHost   = toHost;
          msg.endpoint = options.path;
          msg.xhrError = 'xTime';
          msg.errCount++;
          if (msg.req === 'requestShard'){
            this.procAsShard(msg);
            return;
          }
          this.net.emit('xhrFail',msg);
       }
       req.destroy();
     });

     req.on('error', error => {
        if (emitError !== null) return;

        emitError     = true;
        msg.toHost    = toHost;
        msg.endpoint  = options.path;
        msg.xhrError  = 'xError';
        msg.xhrErCode = error.code;
        msg.errCount++;
        if (error.code === 'ETIMEDOUT') {
          msg.xhrError = 'xTime';
        }
        if (msg.req === 'requestShard'){
          this.procAsShard(msg);
          return;
        }
        this.net.emit('xhrFail',msg);
     })

     req.write(data);
     req.end();
  }
  procAsShard(msg){
    let shard   = msg.shard;
    shard.index = msg.sIndex;
    shard.error = msg.xhrError;
    shard.data  = null;
    //console.log(`requestShard:: Error `,shard.error);
    this.net.emit('requestBinShardOk',shard);
  } 

  sendBinaryShardCX(service,shard){
    const https    = require('https');
    const toHost   = service.host;
    shard.sentTime = Date.now();

    let emitError  = null;
    const data     = shard.shard;

    const params = new URLSearchParams({
      hash    : shard.hash,         // canonical shard hash
      hashID  : shard.hashHID,      // unique shard pointer 
      hashSig : shard.hashSig,
      encrypt : shard.encrypt,
      expires : shard.expires,
      nCopys  : shard.nCopys,
      pass    : shard.pass,
      fptr    : shard.fptr,
      index   : shard.shardIdx,
      from    : shard.from
    });

    const endPoint = `${service.endPoint}?${params.toString()}`;

    const options = {
       hostname : service.host,
       port     : service.port,
       path     : endPoint,
       method: 'POST',
       headers: {
         'Connection': 'close',
         'Content-Type': 'application/octet-stream',
         'Content-Length': data.length
       },
       timeout: 30000
     }
     //console.log(`sendBinaryShardCX():: sending`,options);
     const req = https.request(options, res => {
       let chunks = [];
       res.on('data', (chunk)=>{
         chunks.push(chunk);
       });

       res.on('end',async ()=>{
         const body = Buffer.concat(chunks);

         shard.toHost = toHost;
         if (res.statusCode !== 200) {
           shard.toHost   = toHost;
           shard.endpoint = options.path;
           shard.xhrError = res.statusCode;
           this.net.emit('xhrBinShardFailed',shard);
           console.log(`sendBinaryShardCX():: NOT 200`,shard);
         } else {
           //console.log('bin send good',shard.shardIdx,shard.shardId);
           const res = body.toString();
           try {        
             shard.res = JSON.parse(res);
             this.net.emit('xhrBinShardOK',shard);
           }
           catch(e) {
             shard.xhrError = 'jsonParse';
             shard.errMsg   = e;
             shard.toHost   = toHost;
             console.log('bin send JSON parse fail',shard.shardIdx,shard.shardId);

             this.net.emit('xhrBinShardFailed',shard);
           }
         }
       });
     });
     req.on("timeout", () => {
       if (emitError === null){
          emitError    = true;
          shard.toHost   = toHost;
          shard.endpoint = options.path;
          shard.xhrError = 'xTime';
          shard.errCount++;
          console.log(`sendBinaryShardCX():: timeout first`,shard);
          this.net.emit('xhrBinShardFailed',shard);
       }
       req.destroy();
     });

     req.on('error', error => {
        if (emitError !== null) return;

        emitError       = true;
        shard.toHost    = toHost;
        shard.endpoint  = options.path;
        shard.xhrError  = 'xError';
        shard.xhrErCode = error.code;
        if (error.code === 'ETIMEDOUT') {
          shard.xhrError = 'xTime';
        }
       console.log(`sendBinaryShardCX():: timeout xTime`,shard);
       this.net.emit('xhrBinShardFailed',shard);
     })
     req.write(data);
     req.end();
  }
  extractJSONIfPresent(buf) {
    const prefix = Buffer.from('{"result":0,"msg":');

    if (buf.slice(0, prefix.length).equals(prefix)) {
      // Convert entire buffer to string
      return buf.toString('utf8');
    }

    return null; // not JSON, it's a real binary shard
  }
};
module.exports.BorgHUIstreamMgr = BorgHUIstreamMgr;
