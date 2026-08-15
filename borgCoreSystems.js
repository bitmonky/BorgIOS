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
    addCoreApp(fnameCell,status='unknown',netPort=null,recpPort=null,monPort=null){
      const exists = this.coreApps.some(app => app.src === fnameCell);

      if (exists) {
        console.log(`App with src '${fnameCell}' already exists. Skipping.`);
        return;
      }

       const app = {
          src  :  fnameCell,
          name :  fnameCell.replace('Cell.js','',fnameCell),
          ports : {
            network  : netPort,
            receptor : recpPort,
            monitor  : monPort
          },
          status : status,
          nodes  : []
       }
       this.coreApps.push(app);
       console.log('BorgCoreSystemApp Added:',app);
       return;
    }
    getCoreSystemsReport(){
      var s = `\nBorgIOS Core Network Status Report:\nCore Networks Availabe:\n\n`;
      this.coreApps.forEach((app) => {
        s += `\n`+JSON.stringify(app);
      }); 
      s += `\nEnd Status Report\n`;
      return s;
    }
    getCoreSysProtocols(){
      return `
        Core Systems Engineer Protocols:
          {"req":"updatePorts","coreAppName":name,"ports":{"network": int,"receptor": int,"monitor":int},"agentID":<your agentID>}
          required fields: all
          current port info can be found in the BorgIOS.net code repository (you will need correct ports to connect to the network monitor endpoints).
      `;          
    }
    checkForCoreEngineer(){
       if (this.brain.agentSpecialty == 'Core Systems Engineer'){
          return;
       }
       var isEng = false;
       this.brain.BORGO.forEach((borg) => {
          if (borg.specialty == 'Core Systems Engineer'){
             isEng = true;
          }
       });
       if (isEng) {
         return;
       }
       let req = {system:'Notification'};
       let msg = `Important Notice: No "Core Systems Engineer" specialtist online... someone needs to take on this critical role. to do so use the  
                 {req:selectMySpecialty} protocol and change your specialty to "Core Systems Engineer".`;
       this.brain.respondToBorg(req,msg);    
       
    }
    async handleBorgResponse(r) {
      return new Promise((resolve,reject) =>{
        if (r.req == 'updatePorts'){
          this.doUpdatePorts(r);
          resolve(true);
          return;
        }
        resolve(false);
      });
    }
    doUpdatePorts(r){
       if (!r.coreAppName){
         return this.brain.respondEr(`coreAppName field is missing`,r);
       }
       if (!r.ports){
         return this.brain.respondEr(`ports object is missing`,r);
       }
     
       const index = this.coreApps.findIndex(app => app.name === r.coreAppName);
       if (index === -1){
         return  this.brain.respondEr(`corAppName '${r.coreAppName}' Not Found`,r);
       }
       if (r.ports.network) 
         this.coreApps[index].ports.network = r.ports.network;
       if (r.ports.receptor)
         this.coreApps[index].ports.receptor = r.ports.receptor;
       if (r.ports.receptor)
         this.coreApps[index].ports.monitor = r.ports.monitor;
        
       return this.brain.respondToBorg(r,`OK ${r.coreAppName} ports updated`);
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
