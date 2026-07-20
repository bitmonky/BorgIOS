/************************************************************
 *  CONFIG INPUTS (append real values above this line)
 ************************************************************/

// Example of what you will append dynamically:
//
//   var MODE        = "mobile";        // or "PC"
//   var ROOT_DOMAIN = "bitmonky.com";
//   var SERVICE_HOST = "your.portal.host";
//   var NET_PORT     = 8080;
//   var PIN          = "TEST_PIN_2x49fg16";
//
// You can append these from PHP, Node, or your template engine.
// Everything below uses these injected globals.

/************************************************************
 *  RUNTIME STATE
 ************************************************************/

var hasAccount = false;
var qryAction  = 'not set';
var borgMUID   = null;

var service = {
  host     : SERVICE_HOST,
  port     : "",
  endPoint : "/whzon/gold/netWalletAPI.php"
};

const evt = new EventSource("/borgEvents");

evt.addEventListener("upload-progress", (e) => {
  const msg = JSON.parse(e.data);
  console.log("progress:", msg);
});

evt.addEventListener("borg-event", (e) => {
  const msg = JSON.parse(e.data);
  handleBorgMsg(msg);
});
let atTop = false;
function noenter() {
  return !(window.event && window.event.keyCode == 13);
}

function handleBorgMsg(msg){
  console.log(`handleBorgMsg():: msg`,msg);
  if (msg.req === 'updateUpload'){
    doUpdateUpload(msg);
    return;
  }
  if (msg.req === 'updateMemQry'){
    doUpdateMemQry(msg);
    return;
  }
}
function doUpdateMemQry(msg){
  let div = document.getElementById(`mem-${msg.hash}`);
  console.log(`doUpdateMemQry():: div`,msg);
  if (div){
    if (msg.error === true){
      div.style.display='none';
      return;
    }
    
    // Parse the HTML content (assuming msg.html contains the JSON string)
    let memoryData;
    try {
      memoryData = JSON.parse(msg.html);
      console.log(memoryData);
    } catch(e) {
      // If it's not JSON, use the html as is
      div.innerHTML = msg.html;
      return;
    }
    
    // Build the listing HTML
    let listingHTML = '';

    if (memoryData.renderHtml){
      div.innerHTML = memoryData.renderHtml;
      return;
    }    
    // Handle image display
    if (memoryData.ftype && memoryData.ftype.startsWith('image/')) {
      listingHTML += `
        <div style="float: left; max-height: 7em; margin-right: 1.5em;">
          <img src="http://localhost/netREQ/file=${memoryData.memoryID}" 
               alt="${memoryData.title || 'Memory image'}" 
               style="max-height: 7em; object-fit: contain;">
        </div>
      `;
    }
    
    // Add the text content
    listingHTML += `
      <div style="margin-left: ${memoryData.ftype && memoryData.ftype.startsWith('image/') ? '7em' : '0'};">
        <div style="font-weight: bold; font-size: 1.1em;">
          ${memoryData.title || 'Untitled'}
        </div>
        ${memoryData.description ? `<div style="color: #ddd; margin: 0.3em 0;">${memoryData.description}</div>` : ''}
        <div style="font-size: 0.85em; color: #999;">
          ${memoryData.tags ? `Tags: ${memoryData.tags.join(', ')}` : ''}
          ${memoryData.date ? ` • ${memoryData.date}` : ''}
        </div>
      </div>
      <div style="clear: both;"></div>
    `;
    
    div.innerHTML = listingHTML;
  }
}
function doUpdateMemQryOld(msg){
  let div = document.getElementById(`mem-${msg.hash}`);
  console.log(`doUpdateMemQry():: div`,div);
  if (div){
    if (msg.error === true){
      div.style.display='none';
      return;
    }
    div.innerHTML = msg.html;
  }
}
function doUpdateUpload(msg){

  let div = document.getElementById('uploadSpot');
  if (div){
    div.innerHTML = msg.text;
  }
}

/*
********************
Override Date class so that all nodes use one unifide time dictated By the root node.
Capture the real Date constructor and real Date.now
********************
*/

const RealDate = Date;
const realNow = RealDate.now;

let peerTCorrection = 0;

// Override the Date constructor
function CorrectedDate(...args) {
  if (args.length === 0) {
    return new RealDate(realNow() + peerTCorrection);
  }
  return new RealDate(...args);
}

// Copy static methods
CorrectedDate.now = () => realNow() + peerTCorrection;
CorrectedDate.UTC = RealDate.UTC;
CorrectedDate.parse = RealDate.parse;

// Preserve prototype so instanceof still works
CorrectedDate.prototype = RealDate.prototype;

// Install the override
Date = CorrectedDate;//console.error('running::',process.title);

function parseChronyOffset(output) {
  // Find the line containing "Last offset"
  const match = output.match(/Last offset\s*:\s*([+-]?\d+\.?\d*)\s*seconds/i);
  if (!match) {
    throw new Error("Could not parse chronyc tracking output");
  }

  const seconds = parseFloat(match[1]);
  const milliseconds = Math.round(seconds * 1000);

  return milliseconds;
}


/*
 ::End Time Overide code
*/

/************************************************************
 *  CORE FUNCTIONS
 ************************************************************/

function init() {
  console.log("helloworld");
  setInterval(updateBorgClock, 500); // smooth 10Hz update
  updateBorgClock();
  setInterval(getBorgTime, 60*1000); 
  getBorgTime();
  getAccountInfo();
}
function getBorgTime(){
  console.log(`getBorgTime():: TTTT:TTT:TTTT: `);
  sendRequest({req: "sendBorgTime"});
}
function doUpateBorgTime(j){
  console.log(`doUpateBorgTime():: j`,j);
  peerTCorrection = j.borgTime;
  console.log(`doUpateBorgTime():: `, doUpateBorgTime);
}
function updateBorgClock() {
  const now = new Date(); // this uses your overridden Date.now()
  document.getElementById('borgClock').textContent =
  new Date().toLocaleString();
}

function chkYouTubeImage(img) {
  console.log(img.attributes);
}

function getAccountInfo() {
  sendRequest({ req: "sendAccountInfo" });
}

function getSendShellsToMbr(muid,nic,icon) {
  icon =  encodeURIComponent(encodeURIComponent(icon));
  sendRequest({
    req: "getSendShellsToMbr",
    parms: { mode: MODE, muid,nic,icon }
  });
}

function doCloseWalletOpt() {
  showDiv("transactionSpot");
}

function cancelSendShells() {
  showDiv("transactionSpot");
}

function doSendShellsNow() {
  var bmgp = document.getElementById("sendBMGPAmt").value;
  var mnic = document.getElementById("sendToNic").value;
  var muid = document.getElementById("sendToMUID").value;

  if (confirm("Send " + bmgp + " BORG Shells To " + mnic + " Now?")) {
    sendRequest({
      req: "doSendShells",
      parms: {
        mode: MODE,
        address: null,
        amt: bmgp,
        mbrMUID: muid
      }
    });
  }
}

function doSendRegServiceFrm() {
  sendRequest({
    req: "getRegServiceFrm",
    parms: { mode: MODE }
  });
}

function doSendRegServiceReq() {
  var but   = document.getElementById("psrvRegBut");
  but.disabled = true;

  var host  = document.getElementById("psrvHost").value.trim();
  var port  = document.getElementById("psrvPort").value.trim();
  var point = document.getElementById("psrvEndPoint").value.trim();
  var title = document.getElementById("psrvTitle").value.trim();
  var desc  = document.getElementById("psrvDesc").value.trim();

  var cport = port ? ":" + port : "";
  if (point[0] !== "/") point = "/" + point;

  if (confirm("Register Service https://" + host + cport + point + " Now?")) {
    sendRequest({
      req: "doRegNewService",
      parms: {
        mode: MODE,
        host,
        port,
        endPoint: point,
        title,
        desc
      }
    });
  } else {
    but.disabled = false;
  }
}

function doSendTrendingReq() {
  sendRequest({
    req: "sendTrendingList",
    parms: { mode: MODE }
  });
}

function doSendUseDefaultWallet() {
  hideDiv("walletForm");
  sendRequest({
    req: "useNewWallet",
    wallet: { ownMUID: "useDefault" },
    parms: { mode: MODE }
  });
}

function doSendUseWallet(w) {
  sendRequest({
    req: "useNewWallet",
    wallet: w,
    parms: { mode: MODE }
  });
}

function doSendServiceListReq() {
  sendRequest({
    req: "sendServiceList",
    parms: { mode: MODE }
  });
}

function borgSendUpdateResByUrl(url, res, callbck = null, extendTime = 50) {
  sendRequest(
    {
      req: "borgUpdateResByUrl",
      parms: { mode: MODE, url, res },
      callbck
    },
    extendTime
  );
}

function doSendUpdateResByUrl(url, res, callbck = null, extendTime = 50) {
  sendRequest(
    {
      req: "updateResByUrl",
      parms: { mode: MODE, url, res },
      callbck
    },
    extendTime
  );
}

function doSendBorgFileSys() {
  sendRequest({
    req: "sendBorgFileSys",
    parms: { mode: MODE }
  });
}

function doSendStoresReq() {
  sendRequest({
    req: "sendStoresList",
    parms: { mode: MODE }
  });
}

function doSendWalletOptions() {
  hideDiv("transactionSpot");
  sendRequest({
    req: "sendWalletOptions",
    parms: { mode: MODE }
  });
}
function openBorgUserEdit(firstTime=true) {
    // 1. Create the Modal Overlay
    const overlay = document.createElement('div');
    overlay.id = 'borg-modal-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px);
        display: flex; justify-content: center; align-items: center;
        z-index: 9999; font-family: sans-serif;
    `;
    let title = "Edit Borg User Profile";
    if (firstTime) {
      title = ".: Welcome To The Borg Collective :. ";
    }
    // 2. Build the Modal Form HTML
    overlay.innerHTML = `
        <div style="background: #1e2e1e; border: 2px solid #4caf50; border-radius: 8px; padding: 25px; width: 550px; color: #e0e0e0; box-shadow: 0 0 20px rgba(76, 175, 80, 0.3);">
            <h3 style="color: #4caf50; margin-top: 0; text-shadow: 0 0 5px rgba(76,175,80,0.5);">${title}</h3>

            <form id="borg-upload-form" enctype="multipart/form-data">
                <!-- Visible Inputs -->
                <div style="margin-bottom: 15px;">
                    <label style="display:block; margin-bottom: 5px; font-size: 0.9em;">Choose Your Borg Name</label>
                    <input type="text" name="nicname" required style="width: 100%; padding: 8px; background: #0d1a0d; border: 1px solid #4caf50; color: #fff; border-radius: 4px;">
                </div>

                <!--div style="margin-bottom: 15px;">
                    <label style="display:block; margin-bottom: 5px; font-size: 0.9em;">Description</label>
                    <textarea name="description" rows="3" style="width: 100%; padding: 8px; background: #0d1a0d; border: 1px solid #4caf50; color: #fff; border-radius: 4px; resize: vertical;"></textarea>
                </div-->

                <div style="margin-bottom: 20px; border: 1px dashed #555; padding: 10px; text-align: center; border-radius: 4px;">
                    <label style="display:block; margin-bottom: 5px; font-size: 0.9em; cursor: pointer;">
                        Change User Avitar
                        <input type="file" name="fileData" required style="display: block; margin: 10px auto 0; color: #ccc;">
                    </label>
                </div>
                <div ID='uploadSpot'></div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" onclick="document.getElementById('borg-modal-overlay').remove()" style="padding: 8px 15px; background: #333; color: #aaa; border: 1px solid #555; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button type="submit" style="padding: 8px 15px; background: #4caf50; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; text-shadow: 0 0 5px rgba(76,175,80,0.5);">Assimilate Now</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    // 3. Attach the submit event listener to call doCreateBorgMemory

    const form = document.getElementById('borg-upload-form');
    form.addEventListener('submit', async function(e) {

        e.preventDefault(); // Prevent default form submission
        // Collect form data
        const formData = new FormData(this);

        // Call the backend logic
        await doUpdateBorgProfile(formData);
    });
}
async function doUpdateBorgProfile(formData) {
  //  try {
        // 1. Extract ONLY the text fields from the FormData object
        const userMetadata = {
          file    : formData.get('fileData'),
          nicname : formData.get('nicname'),
        };
        console.log(`FormData`,formData);
        console.log("Extracted Metadata for P2P broadcast:", userMetadata);
        
        const nIcon = await startIconPhotoUpload(userMetadata.file);
        console.log(`doUpdateBorgProfile():: nIcon`,nIcon);
  
        let chkSum = nIcon.filePath.replace('uploads\\','');
        
        const icon = {
          fname : nIcon.fileName,
          fcsum : chkSum.replace('.tmp',''),
          rname : nIcon.repoInfo.rname,
          folder: nIcon.repoInfo.folderID,
          path  : nIcon.repoInfo.path,
          ftype : nIcon.mimeType
        }

        var ranTime = new Date().getMilliseconds();

        sendRequest({
          req    : "updateBorgProfile",
          nicname: userMetadata.nicname,
          fuid   : nIcon.fuid,
          icon   : icon,
          xr     : "&xr=" + ranTime
        });

        // Close the modal on success
        document.getElementById('borg-modal-overlay').remove();
        alert("New Human Assimilation In Progress... Propagating to Borg Collective");

/*    } catch (err) {
        console.error('Error Assimilating new Human:', err);
        alert('Failed to Assimilate New Human.');
    }
*/
}
function startIconPhotoUpload(file){
  //scrollToTop();

  const meta = 'ownerMUID=localMUID' +
    '&path=' + encodeURIComponent('/') +
    '&folderID=0' + 
    '&rname=MyFiles' + 
    '&encrypt=0';
  const url  = 'storeRepoFileOnTree.php?' + meta;
  console.log(`startPhotoUpload():: url`,url);

  var spot   = document.getElementById('uploadSpot');
  var html   = "<div style='padding:.5em;display:inline;height:28px;color:#777777;'>";
  html += "<div class='mkyloader'></div>Uploading File For Storage On The PeerTree...</div>";
  spot.innerHTML = html;

  let xhr      = getHttpConnection();
  let formData = new FormData();
  let photo    = file;
  console.log(photo);
  formData.append("photo", photo);

  return new Promise((resolve) => {
    xhr.upload.addEventListener('progress', function(e){
      var file1Size = photo.size;
      if (e.loaded <= file1Size){
        var percent = Math.round(e.loaded / file1Size * 100);
        spot.innerHTML = 'Uploading... ' + percent + '%';
      }
      if (e.loaded == e.total){
        spot.innerHTML = html;
      }
    });

    xhr.timeout = 24 * 60 * 60;
    xhr.open("POST", url);
    xhr.onreadystatechange = function(){
      if (xhr.readyState == 4){
        console.log(xhr.status);
        if (xhr.status == 200){
          var j = xhr.responseText;
          console.log(j);
          try {
            j = JSON.parse(j);
            if (j.result){
              resolve(j);
              return;
            }
            resolve(null)
            spot.innerHTML = "<h2>" + j.msg + "</h2>";
          } catch(err){
            spot.innerHTML = "<h2>JSON Error In Upload Response</h2>is::" + err + xhr.responseText;
          }
        }
      }
    };
    xhr.send(formData);
  });
}
/************************************************************
 *  SEARCH / QUERY
 ************************************************************/

function loadHashQry(n, qry) {
  doSendPeerMemQry(qry);
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  hideDiv("transactionSpot");
}

function doSendPeerMemQry(hashStr = null) {
  hideDiv("transactionSpot");

  var cqry = document.getElementById("peerMemQry");
  var qry = hashStr || cqry.value || "";

  cqry.value = qry;

  showSearching();

  var ranTime = new Date().getMilliseconds();

  sendRequest({
    req: "sendPeerQryResults",
    parms: {
      mode: MODE,
      qry,
      xr: "&xr=" + ranTime
    }
  });
}
function doSearch() {
  hideDiv("transactionSpot");

  var cqry   = document.getElementById("sQry");
  var prompt = cqry.value || "";

  cqry.value = prompt;

  showSearching();

  var ranTime = new Date().getMilliseconds();

  sendRequest({
    req: "sendBorgChatMsg",
    parms: {
      mode   : MODE,
      prompt : prompt,
      xr     : "&xr=" + ranTime
    }
  });
}

function showSearching() {
  var spot = document.getElementById("Searching");
  if (spot) spot.style.display = "block";
}

function hideSearching() {
  var spot = document.getElementById("Searching");
  if (spot) spot.style.display = "none";
}

/************************************************************
 *  ACCOUNT CREATION / LOGIN
 ************************************************************/

function doLinkAccount() {
  if (!confirm("Link This Wallet To Your BitMonky Account?")) return;

  butToFetching("butLinkAcc");

  sendRequest({
    req: "linkAccount",
    parms: {
      loginID: document.getElementById("loginID").value,
      password: document.getElementById("password").value
    }
  });
}

function doCreateAccount(nicname,icon,age=0,sex=0) {
  if (!confirm("Create A BitMonky Account For This Wallet?")) return;

  butToFetching("butCreateAcc");

  var sex = document.getElementById("isMale").checked ? 1 : 0;

  sendRequest({
    req   : "createAccount",
    parms : {
      firstname : nicname,
      icon      : icon,
      age       : age,
      sex       : sex
    }
  });
}

function doServiceLogin(service) {
  var useSrv;
  try {
    useSrv = JSON.parse(service);
  } catch (e) {
    console.log("JSON error", e);
    return;
  }

  sendRequest({
    req: "sendLoginToken",
    parms: { busProfile: useSrv.busProfileID },
    service: useSrv
  });
}

function doLogin() {
  if (!hasAccount) {
    alert("No Account Found... Please create an account or use the Link Account option");
    return;
  }

  butToFetching("loginBut");
  sendRequest({ req: "sendLoginToken" });
}

/************************************************************
 *  RESPONSE HANDLER
 ************************************************************/

function handleResponse(j) {
  console.log(j);

  butRestoreTo("butCreateAcc", " Create BitMonky Account ");

  if (j.result === false) {
    doShowAccountOptions(j);
    return;
  }

  if (j.req === "repPINFail") {
    alert("Incorrect PIN Provided... Access Refused");
    return;
  }

  if (j.action === "linkAccount") {
    doSaveLinkAccountInfo(j);
    getAccountInfo();
  }

  if (j.action === "createAccount") {
    doSaveNewAccountInfo(j);
    getAccountInfo();
  }

  if (j.action === "sendAccountInfo") {
    hasAccount = j.hasAccount;
    doShowAccountInfo(j);
  }
  if (j.action === qryAction) doPutQryResults(j);
  if (j.action === "getSendShellsToMbr") doPutQryResults(j);
  if (j.action === "doSendShells") doShowSendShellsResult(j);
  if (j.action === "sendTrendingList") doShowTrendingList(j);
  if (j.action === "sendServiceList") doShowStoresList(j);
  if (j.action === "getRegServiceFrm") doShowStoresList(j);
  if (j.action === "doRegNewService") doHandleNewReg(j);
  if (j.action === "sendStoresList") doShowStoresList(j);
  if (j.action === "sendBorgFileSys") doShowBorgFileSys(j);
  if (j.action === "sendBorgTime") doUpateBorgTime(j);
  if (j.action === "updateAccount") getAccountInfo();
 
  if (j.action === "updateResByUrl" || j.action === "borgUpdateResByUrl") {
    doUpdateResByUrl(j);
  }

  if (j.action === "sendBorgChatMsg") {
    hideSearching();
    doShowQryResults(j);
  }

  if (j.action === "sendPeerQryResults") {
    hideSearching();
    doShowQryResults(j);
  }

  if (j.action === "sendWalletOptions") {
    hideDiv("walletForm");
    doShowQryResults(j);
    createAutoSelect({
      title: "Send BORG Shells To",
      promt: "Type Name",
      action: "qryMemberSendTo"
    });
  }

  if (j.req === "useNewWallet") {
    if (j.result) {
      alert("Wallet Changed");
      getAccountInfo();
    } else {
      alert("Wallet Change Failed... Try Again");
    }
    return;
  }

  if (j.action === "sendLoginToken") {
    var url = "https://web." + ROOT_DOMAIN + "/whzon/mbr/mbrLogin.php?pToken=" + j.accToken + "&pMUID=" + j.pMUID;
    if (j.login) url = j.login;

    if (confirm("Login to Web Service Now?")) {
      var appw = window.open(url, "bitMonky");
      if (!appw) {
        alert("Please disable your popup blocker!");
        var link = document.createElement("a");
        link.target = "BorgIOS.net";
        link.href = url;
        link.click();
      }
    }

    butRestoreTo("loginBut", " BorgOIS.net Online ");
  }
}

/************************************************************
 *  UI HELPERS
 ************************************************************/

function butRestoreTo(id, name) {
  var but = document.getElementById(id);
  if (but) {
    but.value = name;
    but.disabled = false;
  }
}

function butToFetching(id) {
  var but = document.getElementById(id);
  if (but) {
    but.value = " Fetching ... ";
    but.disabled = true;
  }
}

function hideDiv(id) {
  var spot = document.getElementById(id);
  if (spot) spot.style.display = "none";
}

function showDiv(id, display = "block") {
  var spot = document.getElementById(id);
  if (spot) spot.style.display = display;
}

function format(value) {
  return "<span class='mkyMoney'>" + value + "</span>";
}

/************************************************************
 *  FILE SYS / STORE / TRENDING / QUERY RESULTS
 ************************************************************/

function doShowSendShellsResult(j) {
  if (j.actionRes) {
    getAccountInfo();
    alert("Transaction Complete");
  } else {
    alert("Could Not Send... Response Was: " + j.actionRes.msg);
  }
}

function doShowLinkAccount(j) {
  hideDiv("newAccountSpot");

  var spot = document.getElementById("linkAccountSpot");
  if (!spot) return;

  var htm = "<div align='right'>";
  htm += "<input ID='butCreateAcc' type='button' value=' Create BitMonky Account ' onclick='doShowCreateAccount();'/> ";
  htm += "<input ID='butLinkAcc' type='button' value=' Link Account ' onclick='doLinkAccount();'/>";
  htm += "</div>";
  htm += "<input ID='loginID' type='text' placeholder='Account Login ID'/>";
  htm += "<br/><input ID='password' type='password' placeholder='Password'/>";

  spot.innerHTML = htm;
  spot.style.display = "block";
}

function doShowCreateAccount() {
  hideDiv("linkAccountSpot");
  showDiv("newAccountSpot");
}

function doShowAccountOptions(j) {
  var spot = document.getElementById("accountInfo");
  if (!spot) return;

  var htm = "<div class='infoCardClear'>";
  htm += "Account Owner: " + format("No BitMonky Account Found");
  htm += "<br/>" + getAddressSpot(j);
  htm += "<br/>Balance: " + format("NA");
  htm += "<br clear='right'>";
  htm += "<div ID='linkAccountSpot' class='infoCardClear' style='background:#151515;display:none;'></div>";
  htm += "<div ID='newAccountSpot' class='infoCardClear' style='background:#151515;'>";
  htm += "<div align='right'>";
  htm += "<input ID='butCreateAcc' type='button' value=' Create BitMonky Account ' onclick='doCreateAccount();'/> ";
  htm += "<input ID='butLinkAcc' type='button' value=' Link Account ' onclick='doShowLinkAccount();'/>";
  htm += "</div>";
  htm += "<input ID='nicname' type='text' placeholder='Choose Nicname'/>";
  htm += "<br/><input ID='age' type='text' placeholder='Age'/>";
  htm += "<br/><input ID='isMale' type='radio' name='fsex' value='0' checked/>Male ";
  htm += "<input ID='isFemale' type='radio' name='fsex' value='1' />Female";
  htm += "</div></div>";

  spot.innerHTML = htm;

  if (j.result === false && j.data) alert(j.error);
}

function doShowTrendingList(j) {
  var spot = document.getElementById("serviceMenu");
  if (spot) {
    spot.innerHTML = j.html;
  } else {
    spot = document.createElement("DIV");
    spot.id = "serviceMenu";
    spot.innerHTML = j.html;
    document.body.appendChild(spot);
  }
}

function doShowStoresList(j) {
  var spot = document.getElementById("serviceMenu");
  if (spot) {
    spot.innerHTML = j.html;
  } else {
    spot = document.createElement("DIV");
    spot.id = "serviceMenu";
    spot.innerHTML = j.html;
    document.body.appendChild(spot);
  }
}

function doShowQryResults(j) {
  var spot = document.getElementById("serviceMenu");
  if (spot) {
    spot.innerHTML = j.html;
  } else {
    spot = document.createElement("DIV");
    spot.id = "serviceMenu";
    spot.innerHTML = j.html;
    document.body.appendChild(spot);
  }
}

function doHandleNewReg(j) {
  var spot = document.getElementById("serviceMenu");

  if (j.actionRes.result === false) {
    j.html = "<h2 style='color:darkKhaki;'>" + j.actionRes.msg + "</h2>";
    setTimeout(doSendRegServiceFrm, 3000);
  } else {
    doSendServiceListReq();
    return;
  }

  if (spot) {
    spot.innerHTML = j.html;
  } else {
    spot = document.createElement("DIV");
    spot.id = "serviceMenu";
    spot.innerHTML = j.html;
    document.body.appendChild(spot);
  }
}

function doShowBorgFileSys(j) {
  var spot = document.getElementById("serviceMenu");

  if (spot) {
    spot.innerHTML = j.html;

    if (j.js) {
      var old = document.getElementById(j.jsID);
      if (old) old.remove();

      var script = document.createElement("script");
      script.id = j.jsID;
      script.type = "text/javascript";
      script.textContent = j.js;
      document.head.appendChild(script);
    }
  } else {
    spot = document.createElement("DIV");
    spot.id = "serviceMenu";
    spot.innerHTML = j.html;
    document.body.appendChild(spot);
  }
}

function doUpdateResByUrl(j) {
  console.log(`doUpdateResByUrl():: j`,j);
  var spot = document.getElementById(j.res);
  if (!spot) {
    alert("Inserting Target DIV " + j.res + " Failed");
    return;
  }

  if (!j.callback) {
    spot.innerHTML = j.html;
  } else {
    var cb = window[j.callback];
    if (typeof cb === "function") cb(j);
    else alert("callback not found:: " + j.callback);
  }

  if (j.js) {
    var old = document.getElementById(j.jsID);
    if (old) old.remove();

    var script = document.createElement("script");
    script.id = j.jsID;
    script.type = "text/javascript";
    script.textContent = j.js;
    document.head.appendChild(script);
  }
}

/************************************************************
 *  ADDRESS / WALLET FILE
 ************************************************************/

function getAddressSpot(j) {
  return (
    "<div onmouseOver='showDiv(\"changeWLink\",\"inline\");' onmouseout='hideDiv(\"changeWLink\");'>" +
    "Borg Identity: <span ID='borgIdentity'>" +
    format(j.pMUID) + "</span>" +
    " <a ID='changeWLink' style='display:none;' href='javascript:showDiv(\"walletForm\");'>Change Wallet</a></div>" +
    "<div class='infoCardClear' ID='walletForm' style='display:none;'><form> " +
    "Change Wallet <a href='javascript:hideDiv(\"walletForm\");'>Cancel</a> | " +
    "<a href='javascript:doSendWalletOptions();'>Open</a> | " +
    "<a href='javascript:doSendUseDefaultWallet();'>Open Default</a><br/>" +
    "<input onchange='changeWalletFile();' ID='wFile' type='file'>" +
    "</form></div>"
  );
}

/************************************************************
 *  ACCOUNT INFO DISPLAY
 ************************************************************/

function doShowAccountInfo(j) {
  console.log(`Borg Identity():: `,j);
  borgMUID = j.pMUID;
  if (hasAccount !== true) openBorgUserEdit(true);
  var spot = document.getElementById('accountInfo');

  if (!spot) return;
  if (!j.nFarms) j.nFarms = 'No Farms Registerd ';
  var htm = "<div ID='doShowAcc' class='infoCardClear' style='width:100%'>";
  htm += "<a href='javascript:openBorgUserEdit(false);'>";
  htm += "<img ID='borgMyICON' style='width:5em;height:6em;margin:0em 0em 1.5em 1.5em;float:right;border-radius:50%;' src='" + j.icon + "'/></a>";
  htm += "Account Owner: " + format(j.name);
  htm += "🌾 Shell Farms: " +  format(j.nFarms) + "<span style='font-size:larger;'></span>"; 
  htm += getAddressSpot(j) +
         "<br/>Balance: " + format(j.balance) +
         "<br/>" + getSearchHTML() +
         "</div>";

  spot.innerHTML = htm + j.html;
}
function getSearchHTML(){
  var htm = "<form onsubmit='doSendPeerMemQry();return false;'>" +
    "<input style='width:60%;font-size:larger;background: rgba(0, 0, 0, 0.35) !important;' onkeypress='return noenter();' ID='peerMemQry' " +
    " placeholder=' Search BORG Collective Memories' type='text' name='search'/>" +
    " <input ID='peerMemBut' type='button'  value=' Search ' onclick='doSendPeerMemQry();'/> " +
    " <input ID='openWalletBut' type='button'  value=' Send BORG ' onclick='doSendWalletOptions();'/> " +
    "</form>" +
    "<div ID='Searching' style='display:none;'>" +
    "<div style='padding:.5em;display:inline;height:28px;color:#777777;' ><div class='mkyloader'></div>Searching The PeerTree...</div>" +
    "</div>"
  return htm;
}
function sendRequest(msg,extendedTime=50){
    msg.PIN = PIN;
    if (!msg.service){
      msg.service = service;
    }
    console.log('Sending:->',msg);
    msg = JSON.stringify(msg);
    console.log(msg);
    var xml  = new XMLHttpRequest();

    var url = `http://localhost:${NET_PORT}/netREQ/msg=${msg}`;
    xml.timeout   = extendedTime*1000;
    xml.ontimeout = function (){
      alert('Network Timeout Try Again Later');
      document.location.reload();
    }
    xml.onerror   = function (){
      alert('Http Access Error - Try Again Later');
      document.location.reload();
    }
    xml.open("GET", url, true);
    xml.onreadystatechange = function(){
      if (xml.readyState == 4){
        if(xml.status  == 200){
          //alert(xml.responseText);
          var j = null;
          msg = JSON.parse(msg);
          if (!(msg.req === 'getFileFromRepo' || msg.req === 'borgUpdateResByUrl')){
            try {j = JSON.parse(xml.responseText); }
            catch(err) {
              console.log('!!pars json failed::!',msg,url,err,xml.responseText);
              alert('pars json failed::! \n  '+xml.responseText);
              return;
            }
          } else {
            let r = null;
            try {
              console.log(`sendRequest():: r-> RESPONSE`,xml.responseText);
              r = JSON.parse(xml.responseText);
            } catch(e) {
              console.log(e);
            }
            j = {
              action   : 'updateResByUrl',
              res      : msg.res || msg.parms.res,
              callback : msg.callbck,
              meta     : r.res,
              html     : r.html || xml.responseText,
              js       : r.js || '',
              jsID     : r.jsID || ''
            }
          }
          console.log(`sedRequest():: response`,j);
          handleResponse(j);
          return;
        }
      }
    };
    xml.send(null);
}
/************************************************************
 *  WALLET FILE IMPORT
 ************************************************************/

function readWalletFile(event) {
  var wal = event.target.result;

  try {
    wal = JSON.parse(wal);
    if (!wal.ownMUID || !wal.publicKey || !wal.privateKey) {
      alert('Not A Valid Wallet File');
      return;
    }
  } catch (e) {
    alert('Not A Valid Wallet File');
    return;
  }

  console.log('Wallet Loaded:', wal.ownMUID);
  hideDiv('walletForm');
  doSendUseWallet(wal);
}

function changeWalletFile() {
  var input = document.getElementById('wFile');
  var file = input.files[0];

  if (file.size > 500) {
    alert(file.name + ' Is Not A Wallet File!');
    return;
  }

  var reader = new FileReader();
  reader.addEventListener('load', readWalletFile);
  reader.readAsText(file);
}

/************************************************************
 *  SEARCH BAR HTML
 ************************************************************/

function getSearchHTML() {
  return (
    "<form onsubmit='doSendPeerMemQry();return false;'>" +
    "<input style='width:60%;font-size:larger;background:rgba(0,0,0,0.35)!important;' " +
    "onkeypress='return noenter();' ID='peerMemQry' placeholder=' Search BORG Collective Memories' " +
    "type='text' name='search'/> " +
    "<input ID='peerMemBut' type='button' value=' Search ' onclick='doSendPeerMemQry();'/> " +
    "<input ID='openWalletBut' type='button' value=' Send BORG ' onclick='doSendWalletOptions();'/> " +
    "</form>" +
    "<div ID='Searching' style='display:none;'>" +
    "<div style='padding:.5em;display:inline;height:28px;color:#777777;'>" +
    "<div class='mkyloader'></div>Searching The PeerTree...</div>" +
    "</div>"
  );
}

/************************************************************
 *  AUTOSELECT (MEMBER SEARCH)
 ************************************************************/

function doPutQryResults(j) {
  var spot = document.getElementById('putQryResults');
  if (spot) {
    console.log('Updating AutoSelect DIV');
    spot.innerHTML = j.html;
  }
}

function createAutoSelect(opt) {
  var spot = document.getElementById('autoSelSpot');
  console.log('autoSelSpot', spot);

  if (spot) {
    qryAction = opt.action;

    spot.innerHTML =
      "<h2><span style='padding:6px;background:#111111;border-radius:.5em;'>" +
      opt.title +
      "</span></h2>" +
      "<form ID='getLocation' name='wzLocationFrm'>" +
      "<input type='text' style='font-size:larger;' name='flocation' " +
      " autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' " +
      "placeholder='" + opt.promt + "' " +
      "oninput='doClick(event, \"" + opt.action + "\");'>" +
      "<div ID='putQryResults'></div>";
  }
}

/************************************************************
 *  LOCATION AUTOCOMPLETE
 ************************************************************/

function mkyTrim(str) {
  return str.replace(/^\s+|\s+$/g, "");
}

function highlight(row) {
  var wzoutput = document.getElementById("wzline:" + row);
  wzoutput.style.background = "darkOliveGreen";
}

function undoHighlight(row) {
  var wzoutput = document.getElementById("wzline:" + row);
  wzoutput.style.background = "#232425";
}

function doClick(e, action) {
  getMatchingList(action);
}

function getMatchingList(action) {
  var qry = document.getElementById("getLocation").elements["flocation"].value;
  qry = mkyTrim(qry).replace(/,/g, '').replace(/-/g, '').replace(/  /g, ' ');
  const maxRows = 20;
  if (qry !== "") {
    sendRequest({
      req: action,
      parms: { mode: MODE, qry, maxRows }
    });
  } else {
    document.getElementById("putQryResults").innerHTML = "";
  }
}

/************************************************************
 *  VIDEO SHARE / PAGE OPEN
 ************************************************************/

function videoShare(id) {
  var pg = "/whzon/mbr/vidView/viewVideoPg.php?wzID=0&videoID=" + id;

  var app = MODE === "PC" ? "wzApp.php" : "mblp/wzMbl.php";

  window.open(
    "https://web." + ROOT_DOMAIN + "/whzon/" + app + "?furl=" + encodeURIComponent(pg),
    "bitMonky"
  );
}

function wzGetPage(pg) {
  document.location = "/";
  var app = MODE === "PC" ? "wzApp.php" : "mblp/wzMbl.php";
  
  window.open(
    "https://web." + ROOT_DOMAIN + "/whzon/" + app + "?furl=" + encodeURIComponent(pg),
    "bitMonky"
  );
}
function getHttpConnection(){
  var xmlhttp = null;
  if (typeof XMLHttpRequest != 'undefined'){
    try {
      xmlhttp = new XMLHttpRequest();
    } catch(e){
      xmlhttp = false;
    }
  }
  if (!xmlhttp && window.createRequest){
    try {
      xmlhttp = window.createRequest();
    } catch(e){
      xmlhttp = false;
    }
  }
  return xmlhttp;
}
/************************************************************
 *  END OF TEMPLATE
 ************************************************************/

