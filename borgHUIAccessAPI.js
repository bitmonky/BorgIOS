const axios = require('axios');
const https = require('https');

class BorgAccessAPI {
    constructor(net) {
        this.net = net;
        this.PTC_memRECEPTOR   = "https://172.105.110.34:1335";
        this.PTC_shardRECEPTOR = "https://139.177.195.184:13355";
        this.PTC_ftreeRECEPTOR = "https://139.177.195.184:13381";
        this.PTC_mailRECEPTOR  = "https://139.177.195.184:13395/newREQ"; 
        this.PTC_maxWordLength = 45;

        // Create an Axios instance with an agent that ignores SSL cert verification
        this.axiosInstance = axios.create({
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
    }

    async sendRequest(url, reqType, data, treeType='repo') {
        try {
          var response = null;
          switch (treeType) {
            case 'repo':
              response = await this.axiosInstance.post(url, { msg: { req: reqType, repo: data } });
              break; 
            case 'qry':
              response = await this.axiosInstance.post(url, { msg: { req: reqType, qry: data } });
              console.log(url,{msg:{req:reqType,qry:data}});
              break;
            case 'memory':
              response = await this.axiosInstance.post(url, { msg: { req: reqType, memory: data } });
              break;
            case 'shard':
              response = await this.axiosInstance.post(url, { msg: { req: reqType, shard: data } });
              break;
          }    
          if (response){
            return response.data;
          } 
          return {error: 'treeType not found: '+treeType}
        }
        catch (error) {
          return { error: error.message };
        }
    }
    prepWords(str) {
        if (!str || str.trim() === '') return null;

        const words = [' i ', ' in ', ' on ', ' there ', ' is ', ' are ', ' as ', ' the ', ' a ', ' to ', ' and ', ' too ', ' of ', ' for '];
        words.forEach(word => {
            str = str.replace(new RegExp(word, 'gi'), ' ');
        });

        str = str.replace(/[\p{P}\p{S}]+/gu, " ").toLowerCase();
        
        const list = str.split(' ').map(word => word.slice(0, this.PTC_maxWordLength));
        const newStr = list.filter(word => word.trim() !== '').join(' ');

        return newStr.length > 0 ? newStr : null;
    }
    
    async ftreeCreateRepo(muid, name, nCopys) {
        return this.sendRequest(this.PTC_ftreeRECEPTOR + "/netREQ", "createRepo", { from: muid, name, nCopys });
    }

    async ftreeCreateRepoFolder(muid, name, folder, parent) {
        return this.sendRequest(this.PTC_ftreeRECEPTOR + "/netREQ", "createRepoFolder", { from: muid, name, folder, parent });
    }

    async ftreeGetMyRepos(muid) {
        return this.sendRequest(this.PTC_ftreeRECEPTOR + "/netREQ", "getMyRepoList", { from: muid });
    }

    async ftreeGetMyRepoPath(muid, name, fname, folderID) {
        return this.sendRequest(this.PTC_ftreeRECEPTOR + "/netREQ", "getMyRepoFilePath", { from: muid, name, fname, folderID });
    }

    async ftreeGetMyRepoFiles(muid, name, fparentID = null) {
        return this.sendRequest(this.PTC_ftreeRECEPTOR + "/netREQ", "getMyRepoFiles", { from: muid, name, parentID: fparentID });
    }

    async ftreeGetFileFromRepo(muid, name, file, path, folderID) {
        return this.sendRequest(this.PTC_ftreeRECEPTOR + "/netREQ", "getRepoFileData", { from: muid, name, file, path, folderID });
    }

    async ftreeInsertFileToRepo(muid, name, file, path, folderID, nCopys) {
        return this.sendRequest(this.PTC_ftreeRECEPTOR + "/netREQ", "insertRSfile", { from: muid, name, file, path, folderID, nCopys });
    }

    async ftreeDeleteFileFromRepo(muid, name, file, path, nCopys) {
        return this.sendRequest(this.PTC_ftreeRECEPTOR + "/netREQ", "deleteRSfile", { from: muid, name, file, path, nCopys });
    }

    async ptreeStoreShard(muid, hash, shard, encrypt = null, nCopys = 3, expires = null) {
        return this.sendRequest(this.PTC_shardRECEPTOR + "/netREQ", "storeShard", { from: muid, hash, data: shard, encrypt, expires, nCopys },'shard');
    }

    async ptreeRequestShard(muid, hash, encrypted = null) {
        return this.sendRequest(this.PTC_shardRECEPTOR + "/netREQ", "requestShard", { ownerID: muid, hash, encrypted },'shard');
    }

    async ptreeDeleteShard(muid, hash, encrypted = null, nCopys = 3) {
        return this.sendRequest(this.PTC_shardRECEPTOR + "/netREQ", "deleteShard", { ownerID: muid, hash, nCopys },'shard');
    }
    async ptreeSearchMem(muid, str, type, scope = null, scopeID = null, qryLimit = null, qryOrder = null) {
      const payload = {
        ownerID: muid,
        qryStr: this.prepWords(str),
        qryType: type,
        qryStyle: 'bestMatch',
        timestamp: Math.floor(Date.now() / 1000),
        reqScore: 0.0005,
        nResults: 100,
        nRows: 15,
        pg: 1,
        qryLimit: qryLimit || ' limit 40',
        qryOrder: qryOrder || undefined
      };

      if (scope) {
        payload.scope = scope;
        payload.scopeID = scopeID;
      }

      payload.key = this.ptreeMakeSearchKey(payload);

      return this.sendRequest(this.PTC_memRECEPTOR + "/netREQ", "searchMemory", payload,'qry');
   }
   async ptreeStoreMem(muid, acID, str, type = 'generic', nCopys = 3, weights = null) {
     const payload = {
        from: muid,
        memID: acID,
        memStr: str,
        memType: type,
        nCopys: nCopys,
        weights: weights
     };

     return this.sendRequest(`${this.PTC_memRECEPTOR}/netREQ`, "storeMemory", payload,'memory');
  }
  ptreeMakeSearchKey(j) {
     return require('crypto').createHash('sha256').update(JSON.stringify(j)).digest('hex');
  }
  async peerMailGetMyMsgs(muid, sig) {
        const req = { req: 'getMyMail', ownMUID: muid, sig: sig };

        try {
            const response = await axios.post(this.PTC_mailRECEPTOR, { msg: req });
            return response.data;
        } catch (error) {
            console.error("Error fetching mail:", error);
            return null;
        }
  }

  async peerMailSendMsg(toMuid, mail, sig) {
        const req = { req: 'sendMail', toMUID: toMuid, sig: sig, mail: mail };

        try {
            const response = await axios.post(this.PTC_mailRECEPTOR, { msg: req });
            return response.data;
        } catch (error) {
            console.error("Error sending mail:", error);
            return null;
        }
    }

  async peerMailGetInboxKey(muid) {
        const req = { msg: { req: "getInBoxKey", ownMUID: muid } };

        try {
            const response = await axios.post(this.PTC_mailRECEPTOR, req);
            return response.data;
        } catch (error) {
            console.error("Error retrieving inbox key:", error);
            return null;
        }
    }

  async peerMailRegisterInBox(muid, token, publicKey, sig) {
        const p = {
            inboxMUID: muid,
            nCopies: 3,
            sig: { ownMUID: muid, signature: sig, token: token, pubKey: publicKey }
        };

        const req = { msg: { req: "registerInBox", ...p } };

        try {
            const response = await axios.post(this.PTC_mailRECEPTOR, req);
            return response.data;
        } catch (error) {
            console.error("Error registering inbox:", error);
            return null;
        }
  }
}
module.exports.BorgAccessAPI = BorgAccessAPI;
