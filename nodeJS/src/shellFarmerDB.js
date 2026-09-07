const fs = require('fs');
const mysql = require('mysql2');

let heartbeatInterval = null;
let heartbeatFailures = 0;
const MAX_HEARTBEAT_FAILURES = 1;

let dba = null;

// Load DB config
try {
  dba = fs.readFileSync('shellfarmerdbconf');
} catch {
  console.log('database config file `shellfarmerdbconf` NOT Found.');
}

try {
  dba = JSON.parse(dba);
} catch {
  console.log('Error parsing `shellfarmerdbconf` file');
}

class ShellFarmerDB {
  constructor(net) {
    this.net = net;
  }
  async init(){
    const doTry = await createConnectionSF(this);
    console.log(`ShellFarmerDB.Init`,doTry);
    return this.conSF;
  }
  startHeartbeat(connection) {
    console.log(`💔 Heartbeat Pulse`);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  
    heartbeatInterval = setInterval(() => {
      if (!connection || !connection.threadId) {
        console.log('⚠️HeartBeat: No connection ');
        //clearInterval(heartbeatInterval);
        return;
      }
     
      // Use ping or simple query
      connection.query('SELECT 1', async (err) => {
        if (err) {
          heartbeatFailures++;
          console.log(`💔 Heartbeat failed (${heartbeatFailures}/${MAX_HEARTBEAT_FAILURES}):`, err.code);
        
          if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
            console.log('🔄 Multiple failures - reconnecting...');
            //clearInterval(heartbeatInterval);
            await createConnectionSF(this);
          }
        }
        else {
          heartbeatFailures = 0;
          //console.log('💓 Heartbeat OK');
        }
      });
    }, 3000); // Every 3 seconds
  }
}
let connection = null;
function createConnectionSF(dbm) {
  return new Promise((resolve) => {
    if (connection) {
      console.log(`createConnectionSF():: destroy old con`);
      connection.destroy();
      connection = null;
    }
    connection = mysql.createConnection({
      host: "127.0.0.1",
      user: dba.user,
      password: dba.pass,
      database: "shellFarmer",
      dateStrings: "date",
      multipleStatements: true,
      supportBigNumbers: true
    });

    const lsConnect = connection.connect((err) => {
      if (err) {
        console.error('Error connecting to shellFarmer database:', err);
      } else {
        console.log('Connected to shellFarmer database');
        dbm.conSF  = connection;
        dbm.net.db = dbm.conSF;
        resolve(true);
        dbm.startHeartbeat(connection);
      }
    });
    lsOnDBer = connection.on('error', (err) => {
      console.error('BORG:shellFarmerDB MySQL Error:', err);

      if (err.fatal || 
          err.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' ||
          err.code === 'ECONNRESET') {

        console.log('Reconnecting after fatal error...');
        try {
          connection.destroy();
        } catch (e) {
           console.log(`connection.destroy():: failed`,e);
           process.exit(1);
        }
      }
    });
  });
}

module.exports.ShellFarmerDB = ShellFarmerDB;

