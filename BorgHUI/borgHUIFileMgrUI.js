//
// BorgIOS Unified Server‑Side HTML Builder
// Produces one giant HTML string to send to the browser
//

class BorgHUIFileMgrUI {
  constructor(net){
    this.net = net;
  }
async createRepoGET(queryString) {
  //
  // 1. Parse GET string
  //
  const params = Object.fromEntries(
    new URLSearchParams(queryString.replace(/^\?/, ""))
  );

  //
  // 2. Extract + defaults
  //
  const mbrMUID = params.owner || this.net.wallet.ownMUID;
  const name    = params.rname  || "";
  let nCopys    = params.ncopys ? Number(params.ncopys) : 10;
  const token   = params.tok    || "";
  console.log(`mbrMUID`,mbrMUID);
  console.log(`name`,name);
  console.log(`nCopys`,nCopys);
/*
  //
  // 3. Validate user token
  //    (PHP used SQL; JS uses your this.net.PTree API)
  //
  const userRec = await this.net.PTree.lookupUserByToken(token);
  // You must implement lookupUserByToken() in borgHUIptreeAPI.js

  if (!userRec) {
    return {
      data: {
        result: false,
        error: "User Not Logged In"
      }
    };
  }
*/

  //
  // 4. Validate repo name
  //
  if (!name || name.trim() === "") {
    return {
      data: {
        result: false,
        error: "Repo Name Can Not Be Blank"
      }
    };
  }

  //
  // 5. Create the repo
  //
  const newRepo = await this.net.PTree.ftreeCreateRepo(
    mbrMUID,
    name,
    nCopys
  );

  //
  // 6. Return JSON (same as PHP echo json_encode)
  //
  return newRepo;
}
async createRepoFolderGET(queryString) {
  //
  // 1. Parse GET string
  //
  const params = Object.fromEntries(
    new URLSearchParams(queryString.replace(/^\?/, ""))
  );

  //
  // 2. Extract + defaults
  //
  const mbrMUID = params.owner    || this.net.wallet.ownMUID;
  const name    = params.rname    || "";
  const folder  = params.folder   || "";
  let parent    = params.parentID || null;
  let nCopys    = params.ncopys ? Number(params.ncopys) : 10;
  const token   = params.tok      || "";

  //
  // 4. Validate repo name
  //
  if (!name || name.trim() === "") {
    return {
      data: {
        result: false,
        error: "Repo Name Can Not Be Blank"
      }
    };
  }

  //
  // 5. Create the repo folder
  //
  const newRepo = await this.net.PTree.ftreeCreateRepoFolder(mbrMUID,name,folder,parent);

  //
  // 6. Return JSON (same as PHP echo json_encode)
  //
  return {result:'OK',newRepo,name,folder,parent};
}
async deleteFileFromRepoGET(queryString) {
  //
  // 1. Parse GET string into an object
  //
  const params = Object.fromEntries(
    new URLSearchParams(queryString.replace(/^\?/, ""))
  );

  //
  // 2. Extract + default parameters
  //
  const mbrMUID  = params.ownerMUID || this.net.wallet.ownMUID;
  const rname    = params.rname     || "";
  const fname    = params.fname     || "";
  const path     = params.path      || "";
  const folderID = params.folderID  ? Number(params.folderID) : 0;

  //
  // 3. Fetch file metadata from repo
  //
  const fd = await this.net.PTree.ftreeGetFileFromRepo(mbrMUID, rname, fname, path, folderID);
  if (!fd) {
    return "Node::ftreeGetFileFromRepo: Failed";
  }

  if (fd.error || fd.json.result === false) {
    return `File ${fname} Not Found`;
  }

  //
  // 4. Delete file record from repo
  const del = await this.net.PTree.ftreeDeleteFileFromRepo(mbrMUID, rname, fname, path);
  console.log(`deleteFileFromRepoGET():: del-> `,del,fd,mbrMUID, rname, fname, path, folderID);
  if (!del) {
    return "Node::ftreeDeleteFileFromRepo: Failed";
  }

  if (del.error || del.status != 200) {
    return "Node::ftreeDeleteFileFromRepo:del.result Failed ";
  }
  if (del.json.result === false){
    return `Node::ftreeDeleteFileFromRep: Failed ${del.json.msg}`;
  }

  //
  // 5. Multi‑try shard deletion (1:1 with PHP)
  //
  const maxConcurrentRequests = 10;
  const sTracker = [];

  let tempShards = fd.json.file.shards;
  let tries = 1;

  while (tempShards.length > 0 && tries <= 2) {
    console.log(`BORG:FASTDELETE::try ${tries}`);

    await this.net.PTree.fastDeleteFileShards(mbrMUID, tempShards, maxConcurrentRequests, sTracker);

    // Remove successfully deleted shards
    tempShards = tempShards.filter(s => {
      const deleted = sTracker.includes(s.shardID);
      if (deleted) console.log("BORG:UNSET::", s.shardID);
      return !deleted;
    });

    tries++;
  }

  //
  // 6. Final message
  //
  return `Message From Borg .:\nFile ${fname} Deleted`;
}
async getBorgFileSys(url) {
  // Merge ctx with repo context defaults
  let ctx = await this.initRepoContextFromGET(url);

  const {
    rname,
    sessISMOBILE = false
  } = ctx;

  let html = "";
  html += `
    <style>
    .unicode-button {
      display: inline-block;
      white-space: nowrap;
      width: auto;
      margin: 0.5em 0;
      font-size: 1em;
      color: white;
      padding:1px 7px 1px 3px;
      background-color:#74a02a;
      border-radius: .25em;
      -webkit-border-radius: .25em;
      -moz-border-radius: .25em;
      transition: all 300ms ease;
      border:0;
      box-shadow:none;
      text-shadow:none;
    }

    button.unicode-button {
      cursor: pointer;
      overflow: visible;
    }

    .unicode-button:before {
      content: "\\27A3";
      padding-right: 10px;
    }

    .unicode-button:focus {
      outline: 0;
    }
    </style>
  `;
  //
  // ---------------------------------------------------------
  // HEADER
  // ---------------------------------------------------------
  //
  html += `
    <h1>BorgIOS .: Collective File System</h1>
    <div align='right' style='margin-bottom:.5em;'></div>
  `;

  //
  // ---------------------------------------------------------
  // LAYOUT WRAPPER
  // ---------------------------------------------------------
  //
  if (!sessISMOBILE) {
    html += `
      <table style='max-width:calc(100%);table-layout:fixed;'>
      <tr valign='top'>
      <td>
    `;
  } else {
    html += `<p/>`;
  }

  //
  // ---------------------------------------------------------
  // SIDEBAR
  // ---------------------------------------------------------
  //
  const sidebarHTML = await this.buildRepoSidebarHTML(ctx);

  html += `
    <div id='sideBar' style='width:25%;min-width:25em;overflow:auto;'>
      ${sidebarHTML}
    </div>
  `;

  //
  // ---------------------------------------------------------
  // RIGHT SIDE (desktop only)
  // ---------------------------------------------------------
  //
  if (!sessISMOBILE) {
    html += `
      </td>
      <td style='width:90em;max-width:90em;overflow:auto;padding-left:5em;'>
    `;
  } else {
    html += `<p/>`;
  }

  //
  // ---------------------------------------------------------
  // FILE DISPLAY AREA
  // ---------------------------------------------------------
  //
  html += `
    <div id='fImgSpot' style='padding:.5em;height:28px;color:#777777;'>
      <div class='mkyloader'></div>Fetching Image From PeerTree...
    </div>

    <div class='infoCardClear' style='background:#151515;' id='imgDisplaySpot'>
      <div id='fileActionSpot' align='right' style='display:none;padding:.5em;color:#777777;'>
        <input ID='avitarButton' type='button' value=' Use As User Avitar '/>
        <input type='button' value=' Delete Repo File ' onclick='deleteRepoFile();'/>
        <input type='button' value=' Download ' onclick='downloadRepoFile();'/>
      </div>

      <div id='dispMemorySpot'></div>

      <video id='videoSpot' style='display:none;' controls>
        <source src="" type="video/mp4">
      </video>

      <div id='textSpot' style='display:none;max-width:100%;overflow:auto;'></div>

      <div style="display:flex;justify-content:center;">
        <img id='photoIMG' src='' onload='hideSearching();' onerror='hideSearching();'
             style='display:none;max-width:100%;'/>
      </div>
    </div>
  `;

  //
  // ---------------------------------------------------------
  // UPLOAD PANEL
  // ---------------------------------------------------------
  //
  html += `
    <div class='infoCardClear' style='background:#151515;' id='uploadSpot'>
      ${(!rname || rname === "")
        ? `
            <h2>Create or Select A Repo To Get Started</h2>
            <span style='color:darkKhaki;'>See left sidebar...</span>
          `
        : `
            <h2>Try Uploading An Image</h2>
            *** Warning *** uploads are public and can be seen by anyone!<br/><br/>

            <form style='margin-top:1.5em;' id="wzPLoadFrm" enctype="multipart/form-data">
              <b>
              <input id='getFile' name="imgshare" type="file">
              <span id="uploadBut">
                <input name="shareIt" value=" Upload " onclick="startPhotoUpload();" type="button"
                       style="border-radius:.45em;border:0px solid #efefef;">
              </span>
              <div id="wzLoading"></div>
              </b>
            </form>
          `
      }
    </div>
  `;

  //
  // ---------------------------------------------------------
  // CLOSE DESKTOP TABLE
  // ---------------------------------------------------------
  //
  if (!sessISMOBILE) {
    html += `
      </td>
      </tr>
      </table>
    `;
  }

  return html;
}

//
// ---------------------------------------------------------
// INIT CONTEXT (PHP → JS)
// ---------------------------------------------------------
//
async initRepoContextFromGET(queryString) {
  //
  // 1. Parse GET string
  //
  console.log(`initRepoContextFromGET():: got qry:`,queryString);
  const params = Object.fromEntries(
    new URLSearchParams(queryString.replace(/^\?/, ""))
  );
  console.log(`initRepoContextFromGET():: params`,params);
  //
  // 2. Extract + defaults (mirrors your PHP logic)
  //
  const root         = params.root      || "139.177.195.184";
  const info         = params.info      || null;
  const ownerID      = params.ownerID   || this.net.wallet.ownMUID;
  const rname        = params.rname     || "";
  const folder       = params.folder    || "";
  let   path         = params.path      || "/";
  let   folderID     = params.folderID  ? Number(params.folderID) : 0;
  const sessISMOBILE = params.sessISMOBILE === "1" || params.sessISMOBILE === "true";

  if (folder !== "") path += folder;
  
  const port  = 13341;
  const rport = 13381;
  let folders = [];

  const idisp = info ? null : "display:none;";

  const mbrMUID = ownerID;
  const fname   = folder;

  //
  // 3. Resolve repo path if repo selected
  //
  if (rname) {
    const myRPath = await this.net.PTree.ftreeGetMyRepoPath(mbrMUID, rname, fname, folderID);

    console.log("ftreeGetMyRepoPath:", myRPath);

    if (!myRPath.error) {
      // Your ftree API returns { path, folders }
      path    = myRPath.json.path    ?? path;
      folders = myRPath.json.folders ?? [];
    }
  }

  //
  // 4. Return the same structure your UI builder expects
  //
  return {
    port,
    rport,
    rootn: root,
    info,
    idisp,
    mbrMUID,
    rname,
    fname,
    path,
    folders,
    folderID,
    sessISMOBILE
  };
}
//
// ---------------------------------------------------------
// SIDEBAR BUILDER (HTML STRING)
// ---------------------------------------------------------
//
async buildRepoSidebarHTML(ctx) {
  const { mbrMUID, rname, fname, path, folderID } = ctx;

  let html = "";

  // HEADER + CREATE REPO FORM
  html += `
    <div class='infoCardClear' style='background:#151515;'>
      <div align='right'>
        <input type='button' value=' Refresh ' onclick='refreshSideBar();'/>
      </div>

      <div class='infoCardClear' style='background:#333333;color:darkKhaki;margin-top:.5em;'>
        <form style='margin-top:1.5em;' onsubmit="return false" enctype="multipart/form-data">
          <b>Create A New Repo:</b><br/>
          <input type='text' style='width:80%' id='newRepoName' placeholder='New Repo Name'>
          <input id="repoCreateIt" value=" Create Repo " onclick="startRepoUpload();" type="button"
                 style="border-radius:.45em;border:0px solid #efefef;">
        </form>
        <div id="newRepoSpot"></div>
      </div>
    </div>
  `;

  // GET MY REPOS
  const myRepos = await this.net.PTree.ftreeGetMyRepos(mbrMUID);

  if (!myRepos.error) {
    console.log(myRepos);
    const result = myRepos.json;

    if (result.list?.length > 0) {
      html += `<h2>Local Repos Found</h2><div style='color:gray'>`;

      result.list.forEach(rec => {
        html += `
          <a href="javascript:changeRepo('${rec.repoName}','${rec.repoOwner}');">
            <div id="id${rec.repoName}" style="width:100%;padding:.0em .5em 1em 1.5em;">
              ${rec.repoName} - Type: ${rec.repoType}<br/>
            </div>
          </a>
        `;
      });

      html += `</div>`;
    }
  } else {
    html += "Get My Repos Failed";
  }

  // IF A REPO IS SELECTED
  if (rname) {
    const myRepoFiles = await this.net.PTree.ftreeGetMyRepoFiles(mbrMUID, rname, folderID);
    console.log(`IF A REPO IS SELECTED `,mbrMUID,rname,folderID,myRepoFiles);
    const result = myRepoFiles.json;

    if (!myRepoFiles.error) {
      html += `<h3>${rname} - Files:</h3>`;
      html += `<div id="newRepoFolderSpot"></div>`;

      const preFolder = this.extractFolderName(path);
      let plinkStart = "";
      let plinkEnd = "";

      if (preFolder) {
        plinkStart = `<a href='javascript:openFolder("${rname}",${folderID},"${preFolder}","${mbrMUID}");'>`;
        plinkEnd = "</a>";
      }

      html += `${plinkStart} ..${path}<br/>${plinkEnd}`;

      // FOLDERS
      html += `<div id="repoFolderSpot:${folderID}">`;

      if (result.folders) {
        result.folders.forEach(rec => {
          html += `
            <div id="folder:${rec.rfoldName}">
              <a href='javascript:openFolder("${rname}",${rec.rfoldID_master},"${rec.rfoldName}","${mbrMUID}");'>
                <div style='width:100%;padding:.0em .5em .5em 1.5em;'>/${rec.rfoldName}</div>
              </a>
            </div>
          `;
        });
      }

      html += `</div>`;

      // FILES
      if (result.list) {
        [...result.list].reverse().forEach(rec => {
          if (rec.smgrFileType === "undefined") {
            rec.smgrFileType = "image/jpeg";
          }

          html += `
            <a href='javascript:doGetFileFromRepo("${rname}","${rec.smgrFileName}","${path}","${folderID}","${rec.smgrFileType}",${rec.smgrEncrypted},"${rec.smgrCheckSum}");'>
              <div style='padding:.0em .5em .5em 1.5em;'>${left(rec.smgrFileName, 30)}</div>
            </a>
          `;
        });
      }

      html += this.drawFolderFormHTML();
    }
  }

  // OTHER FILES
  html += `<h2>Other Files In Storage On The PeerTree Network</h2><ol id="otherFilesList"></ol>`;

  return html;
}

//
// ---------------------------------------------------------
// extractFolderName()
// ---------------------------------------------------------
//
extractFolderName(path) {
  if (!path) path="";
  path = path.trim();
  if (path === "" || path === "/") return null;

  path = path.replace(/\/$/, "");
  const parts = path.split("/");

  if (parts.length < 2) return null;

  const last = parts[parts.length - 1];
  return last || null;
}

//
// ---------------------------------------------------------
// Folder Form (HTML STRING)
// ---------------------------------------------------------
//
drawFolderFormHTML() {
  return `
    <div class='infoCardClear' style='background:#333333;color:darkKhaki;margin-top:.5em;'>
      <form style='margin-top:1.5em;' onsubmit="return false" enctype="multipart/form-data">
        <b>Create A New Folder:</b><br/>
        <input type='text' style='width:80%' id='newRepoFolder' placeholder='New Repo Folder'>
        <input id="repoFCreateIt" value=" Create Folder " onclick="startAddFolder();" type="button"
               style="border-radius:.45em;border:0px solid #efefef;">
      </form>
    </div>
  `;
}
};
function left(str, n) {
  if (!str) return "";
  return str.slice(0, n);
}
module.exports.BorgHUIFileMgrUI = BorgHUIFileMgrUI;
