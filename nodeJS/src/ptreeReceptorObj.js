const https = require('https');
const http  = require('http');
const fs    = require('fs');
const { URL } = require('url');


class PtreeReceptorObj {
  constructor(peerTree, recPort,secure=false) {
    this.peer           = peerTree;
    this.port           = recPort;
    this.secureReceptor = secure;
    this.allow          = ["127.0.0.1"];
    this.endPoints      = [];

    this.readConfigFile();
    setTimeout(() =>{ this.watchEndPoints();},15*1000);

    const options = {
      key: fs.readFileSync('keys/privkey.pem'),
      cert: fs.readFileSync('keys/fullchain.pem')
    };

    this.server = https.createServer(options, (req, res) => {
      this._handleIncoming(req, res);
    });

    // Allowlist enforcement
    this.server.on('connection', sock => {
      if (this.secureRecptor && !this.allow.includes(sock.remoteAddress)) {
        console.error(`Rejected connection from ${sock.remoteAddress}`);
        sock.destroy();
      }
    });

    this.server.listen(this.port, () => {
      console.error(`PtreeReceptor running on port ${this.port}`);
      console.error(`Allowlist:`, this.allow);
    });
  }

  readConfigFile() {
    try {
      if (!this.secureReceptor) throw {message : 'PTreeRecetor: secureReceptor NOT set to true'}
      const raw = fs.readFileSync('keys/mailTree.conf').toString();
      const j = JSON.parse(raw);
      this.secureReceptor = j.receptor.secure;
      this.port           = j.receptor.port;
      this.allow          = j.receptor.allow;
    } catch (err) {
      this.secureReceptor == false;
      console.error('WARNING - Receptor Security Mode is OFF receptor is public::: !', err.message);
    }
  }

  _handleIncoming(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405);
      return res.end('POST only\n');
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 300_000_000) {
        console.error('Max POST size exceeded');
        req.destroy();
      }
    });

    req.on('end', () => {
      let json;
      try {
        json = JSON.parse(body);
        console.log(`got request: `,json);
      } catch {
        res.writeHead(400);
        return res.end('Invalid JSON');
      }
      // Validate Borg Token.
      if (this.checkBorgToken(json,res) === false){
        return;
      }
      json.msg.borgToken = json.borgToken;
  
      if (json.msg.req == 'selectEndPoints'){
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        this.selectEndPoints(json.msg,res);
        return;
      }
      this.handleReq(json, res,req);
    });
  }
  checkBorgToken(j,res) {
    if (process.title === 'cronoTreeCell'){
      return true;
    }

    let doTry = this.peer.net.verifyLogin(j);
    if (doTry.result === true){
      return true;
    }
    // Reject Request.
    console.log(`checkBorgToken():: doTry`,doTry,j);
    res.setHeader('Content-Type', 'application/json');
    let rc = 450;
    if (doTry.msg == 'Token expired') rc = 451;

    res.writeHead(rc);
    res.end(`{"result":false,"error": "Invalid BorgToken Request Rejected","msg":"${doTry.msg}"}`);
    return false;
  }
  // Subclasses override this
  handleReq(msg, res,req) {
    res.writeHead(500);
    res.end('handleReq not implemented');
  }
  async watchEndPoints() {
    try {
      const j = { shard: { nCopys: this.nWatch } };

      let maxIPs = this.peer.net.maxEndPoints;
      if (maxIPs > this.peer.net.rnet.r.lnode) maxIPs = this.peer.net.rnet.r.lnode;  

      let IPs = await this.peer.receptorReqNodeList(j,[],maxIPs);

      // Normalize into full URLs
      IPs = IPs.map(IP => `https://${IP}:${this.port}`);

      // Store them
      this.endPoints = [...IPs];

     //console.log(`watchEndPoints():: updated endpoints:`, this.endPoints);

    } catch (err) {
      console.error("watchEndPoints() error:", err);
    }

    // Schedule next update
    setTimeout(() => this.watchEndPoints(),this.peer.net.endPointWatchTimer);
  }
  selectEndPoints(j, res) {
    if (!this.endPoints || this.endPoints.length === 0) {
      return res.end(`{"result":"noEndpoints"}`);
    }

    res.end(JSON.stringify({
      result: "listOK",
      useReceptors: this.endPoints
    }));
  }
  //
  // ---------------------------------------------------------
  //  xhrJSON — Node equivalent of tryJFetchURLnew()
  // ---------------------------------------------------------
  //
  async xhrJSON({ url, method = 'GET', data = null, timeout = 5000, excTimeout = 180000 }) {
    return new Promise((resolve) => {
      try {
        // Normalize URL like PHP version
        if (!url.startsWith('http')) {
          const domain = process.env.HOSTNAME || 'localhost';
          url = `https://${domain}${url}`;
        }

        const u = new URL(url);

        const opts = {
          method,
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          rejectUnauthorized: false, // matches PHP curl SSL off
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'user-agent': 'PeerTreeNode/1.0',
            'referer': 'https://monkytalk/'
          },
          timeout
        };

        const protocol = u.protocol === 'https:' ? https : http;

        const req = protocol.request(opts, (res) => {
          let raw = '';

          res.on('data', chunk => raw += chunk);
          res.on('end', () => {
            const reply = {
              error: false,
              data: raw,
              json: null,
              jsonError: null,
              jsonErrorMsg: null,
              rcode: res.statusCode,
              furl: url
            };

            try {
              reply.json = JSON.parse(raw);
            } catch (err) {
              reply.error = "JSON decode error";
              reply.jsonError = err.code;
              reply.jsonErrorMsg = err.message;
            }

            resolve(reply);
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ error: "timeout", data: null, json: null });
        });

        req.on('error', (err) => {
          resolve({ error: err.message, data: null, json: null });
        });

        if (method === 'POST' && data) {
          req.write(JSON.stringify(data));
        }

        req.end();

      } catch (err) {
        resolve({ error: err.message, data: null, json: null });
      }
    });
  }

  //
  // Convenience wrapper for POST JSON
  //
  async xhrPostJSON(url, payload) {
    return this.xhrJSON({
      url,
      method: 'POST',
      data: payload,
      timeout: 5000,
      excTimeout: 180000
    });
  }
}

module.exports = PtreeReceptorObj; 

/*
Sample Use Case.
// mailReceptor.js
const PtreeReceptor = require('./ptreeReceptorObj');

class MailReceptor extends PtreeReceptorObj {
  constructor(peerTree, port) {
    super(peerTree, port);
  }

  handleReq(msg, res) {
    switch (msg.req) {
      case 'ping':
        return this.handlePing(msg, res);

      case 'echo':
        return this.handleEcho(msg, res);

      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Unknown request: ${msg.req}` }));
    }
  }

  handlePing(msg, res) {
    res.writeHead(200);
    res.end(JSON.stringify({ pong: true }));
  }

  handleEcho(msg, res) {
    res.writeHead(200);
    res.end(JSON.stringify({ echo: msg.data }));
  }
}

module.exports = MailReceptor;

*/
