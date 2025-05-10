const axios = require('axios');
const https = require('https');

class BorgCoreSystems {
    constructor(inBrain) {
       this.brain   = inBrain;
       this.coreApps  = [];

       // Create an Axios instance with an agent that ignores SSL cert verification
       this.axiosInstance = axios.create({
         httpsAgent: new https.Agent({
           rejectUnauthorized: false
         })
       });
    }
    addCoreApp(fnameObj,netPort,recpPort,monPort){
       const app = {
          src  :  fnameObj,
          name :  fnameObj.replace('Obj.js','',fname),
          ports : {
            network  : netPort,
            receptor : recpPort,
            monitor  : monPort
          }
       }
       this.coreApps.push(app);
       return;
    }
    async sendRequest(url, reqType, data, treeType='repo') {
        try {
          var response = null;
          switch (treeType) {
            case 'repo':
              response = await this.axiosInstance.post(url, { msg: { req: reqType, repo: data } });
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
}
module.exports.BorgCoreSystems = BorgCoreSystems;
