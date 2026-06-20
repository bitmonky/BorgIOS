class BorgHUIBorgPay {
   constructor(net) {
     this.net = net;
   }
   async getSendBorgForm( muidTo, fanName, goldOnHand, icon ) {

     return `
       <div class='infoCardClear' style='background:#151617;margin-top:1.5em;'>

       <img title="${fanName}" onerror="this.display=none;"
         style='float:left;border-radius:50%;margin:0;margin-right:10px;'
         src='${icon}'>

       <b>You are about to send ${fanName} some shells:</b>
       <p></p>

       <form id='bitWalletSendBMGP'>
       <input id="sendToMUID" type="hidden" name="mbrID" value="${muidTo}">
       <input id="sendToNic" type="hidden" value="${fanName}">

       <p>Enter Amount Of Shells To Send</p>

       <input type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
       id="sendBMGPAmt" value="${goldOnHand}" maxlength="29" size="14" width="20" style="width:9em;"> Borg Shells
       <p></p>

       <table border="0">
       <tr>
       <td>
       <h3 style='color:darkKhaki;'>
       Warning You Can Not Get Your Shells Back After You Send Them!
       </h3>

       Confirm Send This Amount Of Shells To <b>${fanName}</b><br/>

       <div id='displayCost'></div>

       <input id="sendGoldBut" type="button" value=" Send Now " onclick="doSendShellsNow()"/>
       <input type='button'  onclick='cancelSendShells();' value=' Cancel '/>
       </td>
       </tr>
       </table>
       </form>

       <br><br><br><br><br>
       </div>
     `;
   }

   async doSendBorgPayRecentTrans(m) {
    const borgAdr = this.net.wallet.ownMUID;
    const uAdr    = m.wAdr || borgAdr;

    // Fetch balances
    let masterBal = await this.net.PTree.peerPaysGetMyBalance(borgAdr);
    let userBal   = await this.net.PTree.peerPaysGetMyBalance(uAdr);

    console.log(`doSendBorgPayRecentTrans():: masterBal `,masterBal);

    masterBal = masterBal.json.balance;
    userBal   = userBal.json.balance;

    // Fetch transactions
    const trans = await this.net.PTree.peerPaysGetMyTrans(uAdr);

    // Build HTML
    let htm = `
    <div class='infoCardClear' id='transactionSpot'>
      <div align='right'>
        <input type='button' value=' Borg File Mgr ' onclick='hideDiv("transactionSpot");doSendBorgFileSys("transactionSpot")'/>
        <input type='button' value=' Hide[>] ' onclick='hideDiv("transactionSpot")'/>
      </div>

      <h1>Borg Tradable Shells Reserve</h1>
      <p>ID: ${borgAdr}</p>

      <p>Master Reserve Contains: ${masterBal.balance.toFixed(3)} BORG Shells
      - Confirms: ${masterBal.confirms}</p>

      <h2>User Balance Request</h2>
      <p>ID: ${uAdr}</p>
      <p>Found: ${userBal.balance.toFixed(3)} BORG Shells - Confirms: ${userBal.confirms}</p>

      <h2>User Transactions</h2>
      <p>User Adr: ${uAdr}</p>

      <table class='docTableSmall'>
        <tr>
          <td>Date</td>
          <td>From</td>
          <td>To</td>
          <td>Amount</td>
          <td>Confirms</td>
          <td>Balance</td>
          <td>Tx</td>
        </tr>
    `;
    console.log(`trans`,trans);
    for (const t of trans.json.transactions) {
      const bal = (t.pledFromAdr === uAdr)
        ? t.pledFrBalance
        : t.pledToBalance;

      htm += `
        <tr>
        <td>${t.pledDate}</td>
        <td>${t.pledFromAdr}</td>
        <td>${t.pledToAdr}</td>
        <td align='right'>${t.pledAmount.toFixed(3)}</td>
        <td>${t.confirms}</td>
        <td align='right'>${bal.toFixed(3)}</td>
        <td>${t.pledTx.slice(0,15)}...</td>
        </tr>
      `;
    }

    htm += `</table></div>`;

    let nicName = this.net.nicName;
    let icon    = this.net.icon;

    if (!nicName) nicName = 'Joe Blow';
    if (!icon) icon =  'http://localhost/netREQ/msg=%7B%22req%22:%22getFileFromRepo%22,%22url%22:%22/whzon/bitMiner/getFileFromRepo.php?wzID=DESKTOP&fname=myIcon.jpg&rname=MyFiles&path=%2F&ownerMUID=1B1xrS6Xi6uhCoXcH8UzSETk81S2pmpWjQ&folderID=0&encrypt=0%22,%22checkSum%22:%22acc84ad4437e6d9008a2f084584845ef44033ff9731a162cfeb0efa88f411d44%22,%22ftype%22:%22image/jpeg%22,%22PIN%22:%22TEST_PIN_2x49fg16%22}';
/*
http://localhost/netREQ/msg=%7B%22req%22:%22getFileFromRepo%22,%22url%22:%22/whzon/bitMiner/getFileFromRepo.php?wzID=DESKTOP&fname=portMale17.jpg&rname=myOtherRepo&path=&ownerMUID=1GAMYVZBDa42Rse5a8rxajzvXiXwN35EQZ&folderID=0&encrypt=0%22,%22checkSum%22:%22cc97009add696816ff58af3f34a9a44c615d8a8ef529fe21696de957d9eeecd3%22,%22ftype%22:%22image/jpeg%22,%22PIN%22:%22TEST_PIN_2x49fg16%22}';
*/
    // Return to HUI
    const j = {
      action  : "sendAccountInfo",
      result  : true,
      name    : nicName,
      balance : `${userBal.balance.toFixed(3)} BORG Shells - Confirms: ${userBal.confirms}`,
      icon    : icon,
      html    : htm,
      js      : "",
      jsID    : this.net.wallet.calculateHash(htm),
      pMUID   : this.net.wallet.ownMUID
    };
    return j;
  }
};
module.exports.BorgHUIBorgPay = BorgHUIBorgPay;

