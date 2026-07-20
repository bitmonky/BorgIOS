// -------------------------------------------------------
// Static config
// -------------------------------------------------------
var port     = 13351;
var mport    = 13341;
var aport    = 13341;
var bport    = 1551;
var nodeType = 'ftreeFileMgrCell';
var appType  = '&nodeType=ftreeFileMgrCell';

// -------------------------------------------------------
// Utility functions
// -------------------------------------------------------
function noenter() {
  return !(window.event && window.event.keyCode == 13);
}

function scrollToTop(){
  hideInfo();
  showSearching();
  document.querySelector('.container').scrollTo({ top: 0, behavior: 'smooth' });
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

function fixImageSizeMax(){
}

function loadHashQry(acID, hashStr){
  window.scrollTo(0, 0);
  doPeerMemQry(hashStr);
}

function startDownLoad(){
  var conf = confirm('Save Your Login Key On Your Device?');
  if (conf){
    var but  = document.getElementById('saveKeyBut');
    var text = 'Some data I want to export';
    var data = new Blob([text], {type: 'text/plain'});
    var url  = window.URL.createObjectURL(data);
    alert("Thank Your Login Key Will Now Be Saved In Your Downloads Directory");
    but.style.display = 'none';
    document.getElementById('download_link').href = url;
  }
}

function startBDownLoad(){
  var text = 'Some data I want to export';
  var data = new Blob([text], {type: 'text/plain'});
  var url  = window.URL.createObjectURL(data);
  document.location.href = url;
}

function start(){
}

function show(id){
  var fspot = document.getElementById(id);
  if (fspot){
    fspot.style.display = 'block';
  }
}

function hide(id){
  var spot = document.getElementById(id);
  if (spot){
    spot.style.display = 'none';
    if (id === 'videoSpot') spot.url = '';
  }
}

function showSearching(){
  var fspot = document.getElementById('fImgSpot');
  if (fspot){
    fspot.style.display = 'block';
  }
}

function hideSearching(){
  var spot = document.getElementById('fImgSpot');
  if (spot){
    spot.style.display = 'none';
  }
}

function hideInfo(){
  var spot = document.getElementById("infoSpot");
  if (spot){
    spot.style.display = 'none';
  }
}

function showInfo(){
  var spot = document.getElementById("infoSpot");
  if (spot){
    spot.style.display = 'block';
  }
}

function doTryAgain(){
  if (document.location.href.indexOf('info=off') !== -1){
    scrollToTop();
    document.location.reload();
  } else {
    document.location.href = 'webConsole.php?info=off';
  }
}

function processFile(j){
  console.log('processFile::', j);
  const fdata = JSON.stringify(j.response);
  var spot = document.getElementById('uploadSpot');
  var html = "<div style='padding:.5em;display:inline;height:28px;color:white;'>";
  html += "<h3>Exploded File And Sent Shards To The PeerTree...</h3>";
  html += fdata + "</div>";
  spot.innerHTML = html;
  openFolder(rname, folderID, foldName,mbrMUID);
}

function handlerProcessFile(j){
  console.log('handlerProcessFile::', j);
  var spot = document.getElementById(j.res);
  spot.innerHTML = j.html;
  refreshSideBar();
}

function startPhotoUpload(){
  //scrollToTop();

  const file = document.getElementById('getFile');
  if (!file.files || file.files.length === 0){
    alert("Please choose a file before attempting to upload.");
    return;
  }
  const meta = 'ownerMUID=' + encodeURIComponent(mbrMUID) +
    '&path=' + encodeURIComponent(path) +
    '&folderID=' + encodeURIComponent(folderID) +
    '&rname=' + encodeURIComponent(rname) +
    '&encrypt=0';
  const url  = 'storeRepoFileOnTree.php?' + meta;
  var spot   = document.getElementById('uploadSpot');
  var html   = "<div style='padding:.5em;display:inline;height:28px;color:#777777;'>";
  html += "<div class='mkyloader'></div>Uploading File For Storage On The PeerTree...</div>";
  spot.innerHTML = html;

  let xhr      = getHttpConnection();
  let formData = new FormData();
  let photo    = file.files[0];
  console.log(photo);
  formData.append("photo", photo);

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
            processFile(j);
          } else {
            spot.innerHTML = "<h2>" + j.msg + "</h2>";
            openFolder(rname, folderID, foldName,mbrMUID);
          }
        } catch(err){
          spot.innerHTML = "<h2>JSON Error In Upload Response</h2>is::" + err + xhr.responseText;
        }
      }
    }
  };
  xhr.send(formData);
}

function openFolder(rname, folderID, fname,owner){
  var url = '/whzon/bitMiner/sendBorgFileSys.php?rname=' + encodeURIComponent(rname) +
    '&folderID=' + folderID + '&folder=' + encodeURIComponent(fname) + `&ownerID=${encodeURIComponent(owner)}`;
  console.log('openFolder::url', url);
  borgSendUpdateResByUrl(url, 'serviceMenu');
}

function changeRepo(rname, owner){
  var url = `/whzon/bitMiner/sendBorgFileSys.php?rname=${encodeURIComponent(rname)}&ownerID=${encodeURIComponent(owner)}`;
  borgSendUpdateResByUrl(url, 'serviceMenu');
}

function startAddFolder(){
  const sbut  = document.getElementById('repoFCreateIt');
  const input = document.getElementById('newRepoFolder');
  let folder  = input.value.trim();

  if (folder === ""){
    alert("Folder name cannot be empty.");
    return;
  }

  const dup = document.getElementById("folder:" + folder);
  if (dup){
    alert('A folder named "' + folder + '" already exists.');
    return;
  }

  const conf = confirm("Create New Folder: " + folder);
  if (!conf) return;

  sbut.disabled = true;

  const spot = document.getElementById('newRepoFolderSpot');
  spot.innerHTML =
    "<div style='margin-top:.5em;padding:.5em;display:inline;height:28px;color:#777777;'>" +
    "<div class='mkyloader'></div>Creating Local Folder</div>";

  const currentTime = new Date();
  const ranTime     = currentTime.getMilliseconds();

  const url =
    '/whzon/bitMiner/createRepoFolder.php' +
    '?wzID=' + encodeURIComponent(sKey) +
    '&rname=' + encodeURIComponent(rname) +
    '&parentID=' + encodeURIComponent(folderID) +
    '&folder=' + encodeURIComponent(folder) +
    '&xr=' + ranTime;

  borgSendUpdateResByUrl(url, 'newRepoFolderSpot', 'handlerCreateRepoFolder');
}

function parseQuery(url){
  const queryString = url.split("?")[1] || "";
  const pairs  = queryString.split("&");
  const params = {};
  for (const pair of pairs){
    if (!pair.includes("=")) continue;
    let [key, value] = pair.split("=");
    params[key.trim()] = value.trim();
  }
  return params;
}

function doBorgRFolderAdd(rname, foldname, foldID, parentID,owner){
  const parent = document.getElementById("repoFolderSpot:" + parentID);
  if (!parent) return;

  const newDiv = document.createElement("div");
  newDiv.id    = "folder:" + foldname;
  newDiv.innerHTML =
    `<a href="javascript:openFolder('${rname}',${foldID},'${foldname}','${owner}');">
      <div style="width:100%;padding:.0em .5em .5em 1.5em;">/${foldname}</div>
    </a>`;

  parent.appendChild(newDiv);

  const items = Array.from(parent.children);
  items.sort((a, b) => {
    const A = a.id.replace("folder:", "").toLowerCase();
    const B = b.id.replace("folder:", "").toLowerCase();
    return A.localeCompare(B);
  });
  items.forEach(el => parent.appendChild(el));
}

function handlerCreateRepoFolder(j){
  console.log('parseQuery():: callback pkg:', j);
  var sbut = document.getElementById('repoFCreateIt');
  var spot = document.getElementById(j.res);
  sbut.disabled = false;
  spot.innerHTML = '';
  const parms = j.meta;

  console.log('parseQuery():: parms', j.meta);
  if (parms.result !== 'OK'){
    alert(`Problem Repo Folder Crete Failed ${j.html}`);
  }
  let newFolderID = j.meta.newRepo;
  console.log('CreateRepoFolder():: newFolderID:', newFolderID);
  doBorgRFolderAdd(parms.name, parms.folder, newFolderID, parms.parent,parms.owner);
  return;
}

function startRepoUpload(){
  var sbut  = document.getElementById('repoCreateIt');
  var rname = document.getElementById('newRepoName').value;
  const conf = confirm('Create New Repo:' + rname);
  if (!conf){
    return;
  }
  sbut.disabled = true;
  var spot = document.getElementById('newRepoSpot');
  var html = "<div style='margin-top:.5em;padding:.5em;display:inline;height:28px;color:#777777;'>";
  html += "<div class='mkyloader'></div>Creating Local Repo And Sharing To The PeerTree...</div>";
  spot.innerHTML = html;

  var currentTime = new Date();
  var ranTime     = currentTime.getMilliseconds();
  var url = '/whzon/bitMiner/createRepo.php?wzID=' + encodeURIComponent(sKey) +
    '&rname=' + encodeURIComponent(rname) + '&xr=' + ranTime;
  borgSendUpdateResByUrl(url, 'newRepoSpot', 'handlerCreateRepo');
}

function handlerCreateRepo(j){
  var sbut = document.getElementById('repoCreateIt');
  var spot = document.getElementById(j.res);
  sbut.disabled = false;
  spot.innerHTML = '';
  var res = j.html;
  try {
    let r = JSON.parse(res);
    let d = JSON.parse(r.data);
    if (d.result){
      document.location.href = 'demoRepo.php?rname=' + encodeURIComponent(rname);
      return;
    }
    alert(res + ' ' + r.data.error);
  } catch(err){
    alert('JSON Error: ' + res + err);
  }
}

function refreshSideBar(){
  openFolder(rname, folderID, foldName,mbrMUID);
  return;
  var url = '/whzon/bitMiner/demoRepoRefreshSB.php?' + queryString;
  borgSendUpdateResByUrl(url, 'sideBar');
}

function startDownload(url, fname){
  const downloadLink = document.createElement("a");
  downloadLink.href     = url;
  downloadLink.download = fname;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

function doGetFileFromTree(fName, ftype=null){
  hide('photoIMG');
  hide('videoSpot');
  hide('textSpot');
  hide('fileActionSpot');
  scrollToTop();
  if (!ftype){ ftype = 'img/png'; }
  showSearching();

  var id = 'photoIMG';
  if      (ftype.substr(0,5) == 'image')              { id = 'photoIMG'; }
  else if (ftype.substr(0,5) == 'video')              { id = 'videoSpot'; }
  else if (ftype.indexOf('download') !== -1)          { id = 'download'; }
  else                                                 { id = 'textSpot'; }

  var spot = document.getElementById(id);

  var dxml = getHttpConnection();
  var url  = '/whzon/bitMiner/getFileFromTree.php?wzID=' + encodeURIComponent(sKey) +
    '&fName=' + encodeURIComponent(fName);

  if (id == 'videoSpot'){
    url = '/whzon/bitMiner/streamShardVid.php?fName=' + encodeURIComponent(fName);
  }

  if (id == 'download'){
    hideSearching();
    const fconf = confirm('Download File .: ' + fName + ' Now?');
    if (!fconf){ return; }
    durl = `/netREQ/file=${fuid}&fmode=download`
    startDownload(durl, fName);
    return;
  }

  spot.src = url;

  if (id == 'textSpot'){
    console.log('textSpot');
    dxml.timeout = 20 * 1000;
    dxml.open("GET", url, true);
    dxml.onreadystatechange = function(){
      if (dxml.readyState == 4){
        if (dxml.status == 200 || dxml.status == 304){
          hideSearching();
          spot.innerHTML = '<xmp>' + dxml.responseText + '</xmp>';
          spot.style.display = 'block';
        }
      }
    };
    dxml.send(null);
  } else {
    if (id == 'videoSpot'){
      show(id);
      spot.type = ftype;
    }
    show(id);
  }
}

var cfileData = null;
var cfileName = null;
var cSpotID   = null;
var cSpotIDtx = null;

var videoObj = null;

function doGetFileFromRepo(rname, fName, path, folderID, ftype=null, encrypt=0, chkSum,fuid){
  hide('avitarButton');
  hide('photoIMG');
  hide('videoSpot');
  hide('textSpot');
  hide('dispMemorySpot');
  show('fileActionSpot');
  scrollToTop();

  if (!ftype){ ftype = 'image/png'; }
  showSearching();

  let id = 'photoIMG';
  let av = null;

  if      (ftype.substr(0,5) == 'image')     { id = 'photoIMG'; av = 'avitarButton';   show('avitarButton'); }

  else if (ftype.substr(0,5) == 'video')     { id = 'videoSpot'; }
  else if (ftype.indexOf('download') !== -1) { id = 'download'; }
  else                                        { id = 'textSpot'; }

  var spot   = document.getElementById(id);
  const dbut = document.getElementById('fileDownloadBut');
  dbut.onclick = function() { downloadRepoFile(`${fuid}`)};

  const mbut = document.getElementById('createBorgMemBut');
  mbut.onclick = function() { createBorgMemory(`${fuid}`,`${ftype}`)};

  console.log(`doGetFileFromRepo():: `,fuid,dbut);

  cSpotID    = spot;
  cSpotIDtx  = id;

  var data = 'wzID=' + encodeURIComponent(sKey) +
    '&fname='    + encodeURIComponent(fName) +
    '&rname='    + encodeURIComponent(rname) +
    '&path='     + encodeURIComponent(path) +
    '&ownerMUID='+ encodeURIComponent(mbrMUID) +
    '&folderID=' + encodeURIComponent(folderID) +
    '&encrypt='  + encrypt;

  cfileData = data;
  cfileName = fName;

  var url  = '/whzon/bitMiner/getFileFromRepo.php?' + data;
  var murl = `/netREQ/msg={"req":"getFileFromRepo","url":"${url}","checkSum":"${chkSum}","ftype":"${ftype}"}`;

  const icon = {
    fname : fName,
    fcsum : chkSum,
    rname : rname,
    folder: folderID,
    path  : path,
    ftype : ftype
  }

  if (id == 'download'){
    hideSearching();
    const fconf = confirm('download file .: ' + fName + ' now?\nFrom .:' + murl);
    if (!fconf){ return; }
    startDownload(murl, fName);
    return;
  }

  if (id == 'textSpot'){
    console.log('textSpot');
    const msg = {
      req      : "getFileFromRepo",
      url      : url,
      checkSum : chkSum,
      ftype    : ftype,
      callbck  : 'handlerTextSpot',
      res      : id
    };
    console.log(msg);
    sendRequest(msg);
  } else {
    hideSearching();
    spot.src = murl;
    if (av) {
      let avb = document.getElementById(av);
      console.log('avitarButton found');
      avb.onclick = function () { updateMyIcon(murl,icon)};
    }
    if (id == 'videoSpot'){
      videoObj = spot;
      if (!videoObj._hasMetaListener) {
        videoObj.addEventListener("loadedmetadata", onMetaLoaded);
        videoObj._hasMetaListener = true;
      }
      show(id);
      spot.type = ftype;
    }
    show(id);
  }
  hideSearching();
}
function onMetaLoaded() {
  const video = videoObj

  console.log("metadata loaded");
  const w = video.videoWidth;
  const h = video.videoHeight;

  if (h > w) {
    console.log("Portrait");
    video.classList.add("portraitVideo");
    video.classList.remove("landscapeVideo");
  } else {
    console.log("Landscape");
    video.classList.add("landscapeVideo");
    video.classList.remove("portraitVideo");
  }
}
function handlerTextSpot(j){
  console.log('handlerTextSpot::Fired', j);
  hideSearching();
  var spot = document.getElementById(j.res);
  spot.innerHTML = '<pre style="white-space: pre-wrap; word-wrap: break-word;">' + escapeHTML(j.html) + '</pre>';
  spot.style.display = 'block';
}

function escapeHTML(str){
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

function displayMemoryFile(){
  hide('photoIMG');
  hide('videoSpot');
  hide('textSpot');
  hide('fileActionSpot');
  scrollToTop();
  showSearching();
  var url    = '/whzon/bitMiner/dispMemoryFile.php?' + cfileData;
  var target = 'dispMemorySpot';
  borgSendUpdateResByUrl(url, target, 'handlerDispMemoryFile');
}
function createBorgMemory(memoryID=null, ftype=null) {
    console.log(`createBorgMemory():: `,borgMUID ,mbrMUID);
    if (borgMUID !== mbrMUID) {
      alert('Not Your File... Action Blocked');
      return;
    }
    // 1. Create the Modal Overlay
    const overlay = document.createElement('div');
    overlay.id = 'borg-modal-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px);
        display: flex; justify-content: center; align-items: center;
        z-index: 9999; font-family: sans-serif;
    `;

    // 2. Build the Modal Form HTML
    overlay.innerHTML = `
        <div style="background: #1e2e1e; border: 2px solid #4caf50; border-radius: 8px; padding: 25px; width: 400px; color: #e0e0e0; box-shadow: 0 0 20px rgba(76, 175, 80, 0.3);">
            <h3 style="color: #4caf50; margin-top: 0; text-shadow: 0 0 5px rgba(76,175,80,0.5);">Upload New Memory</h3>
            
            <form id="borg-upload-form" enctype="multipart/form-data">
                <!-- Hidden Inputs -->
                <input type="hidden" name="memoryID" value="${memoryID}">
                <input type="hidden" name="ftype" value="${ftype}">

                <!-- Visible Inputs -->
                <div style="margin-bottom: 15px;">
                    <label style="display:block; margin-bottom: 5px; font-size: 0.9em;">Title</label>
                    <input type="text" name="title" required style="width: 100%; padding: 8px; background: #0d1a0d; border: 1px solid #4caf50; color: #fff; border-radius: 4px;">
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display:block; margin-bottom: 5px; font-size: 0.9em;">Description</label>
                    <textarea name="description" rows="3" style="width: 100%; padding: 8px; background: #0d1a0d; border: 1px solid #4caf50; color: #fff; border-radius: 4px; resize: vertical;"></textarea>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <label style="display:block; margin-bottom: 5px; font-size: 0.9em;">Location</label>
                        <input type="text" name="location" placeholder="City, Server, or Null" style="width: 100%; padding: 8px; background: #0d1a0d; border: 1px solid #4caf50; color: #fff; border-radius: 4px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="display:block; margin-bottom: 5px; font-size: 0.9em;">Date</label>
                        <input type="date" name="date" style="width: 100%; padding: 8px; background: #0d1a0d; border: 1px solid #4caf50; color: #fff; border-radius: 4px;">
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display:block; margin-bottom: 5px; font-size: 0.9em;">Tags (comma separated)</label>
                    <input type="text" name="tags" placeholder="cyberpunk, ai, borg" style="width: 100%; padding: 8px; background: #0d1a0d; border: 1px solid #4caf50; color: #fff; border-radius: 4px;">
                </div>

                <!--div style="margin-bottom: 20px; border: 1px dashed #555; padding: 10px; text-align: center; border-radius: 4px;">
                    <label style="display:block; margin-bottom: 5px; font-size: 0.9em; cursor: pointer;">
                        Select File (${ftype})
                        <input type="file" name="fileData" required style="display: block; margin: 10px auto 0; color: #ccc;">
                    </label>
                </div-->

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" onclick="document.getElementById('borg-modal-overlay').remove()" style="padding: 8px 15px; background: #333; color: #aaa; border: 1px solid #555; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button type="submit" style="padding: 8px 15px; background: #4caf50; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; text-shadow: 0 0 5px rgba(76,175,80,0.5);">Upload Memory</button>
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
        await doCreateBorgMemory(formData);
    });
}
async function doCreateBorgMemory(formData) {
    try {
        // 1. Extract ONLY the text fields from the FormData object
        const memoryMetadata = {
            memoryID: formData.get('memoryID'),
            ftype: formData.get('ftype'),
            title: formData.get('title'),
            description: formData.get('description'),
            location: formData.get('location'),
            date: formData.get('date'),
            // Convert comma-separated tags string into a clean array
            tags: formData.get('tags') ? formData.get('tags').split(',').map(tag => tag.trim()) : [],
            timestamp: Date.now() // Useful for P2P ordering/versions
        };

        console.log("Extracted Metadata for P2P broadcast:", memoryMetadata);

        var ranTime = new Date().getMilliseconds();

        sendRequest({
          req    : "createBorgMemory",
          memory : memoryMetadata,
          xr     : "&xr=" + ranTime
        });

        // Close the modal on success
        document.getElementById('borg-modal-overlay').remove();
        alert("Metadata extracted successfully. Broadcasting to P2P network...");

    } catch (err) {
        console.error('Error extracting P2P metadata:', err);
        alert('Failed to process memory data.');
    }
}
function downloadRepoFile(fuid){
  console.log(`downloadRepoFile():: `,cfileData);
  var conf = confirm('Download... ' + cfileName + ' Now?');
  if (!conf){ return; }
  const durl = `/netREQ/file=${fuid}&fmode=download`
  console.log(`downloadRepoFile():: durl`,durl);
  const link = document.createElement('a');
  link.href     = durl;
  link.download = cfileName || 'downloaded-file';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
function addslashes(str) {
  return (str + '')
    .replace(/[\\"']/g, '\\$&')
    .replace(/\u0000/g, '\\0');
}
function updateMyIcon(url,icon){
  var conf = confirm('Use Image As User Avitar?');
  if (!conf){ return; }

  const ico = document.getElementById('borgMyICON')
  ico.src = url;
  hideSearching();

  hide('photoIMG');
  hide('videoSpot');
  hide('textSpot');
  hide('fileActionSpot');
  scrollToTop();

  sendRequest({
    req      : "updateMyIcon",
    iconFile : encodeURIComponent(encodeURIComponent(url)),
    icon     : icon
  });
}
function deleteRepoFile(){
  if (borgMUID !== mbrMUID) {
    alert('Not Your File... Action Blocked');
    return;
  }
  console.log('/whzon/bitMiner/borgDelFileFromRepo.php?' + cfileData);
  var conf = confirm('Delete This File From Your Repo?');
  if (!conf){ return; }
  hide('photoIMG');
  hide('videoSpot');
  hide('textSpot');
  hide('fileActionSpot');
  scrollToTop();
  showSearching();
  var url = '/whzon/bitMiner/borgDelFileFromRepo.php?' + cfileData;
  borgSendUpdateResByUrl(url, cSpotIDtx, 'handlerDelRF', 10 * 60);
}

function handlerDelRF(j){
  hideSearching();
  console.log('Response:', j);
  alert(j.html);
  hide('photoIMG');
  hide('videoSpot');
  hide('textSpot');
  hide('fileActionSpot');
  refreshSideBar();
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

function goToMemoryDemo(){
  document.location.href = 'webConsole.php?showInfo=on';
}
