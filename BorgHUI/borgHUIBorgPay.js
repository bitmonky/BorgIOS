const PTree = require("./borgHUIptreeAPI.js");

async function doSendBorgPayRecentTrans(m,wallet) {
  const borgAdr = "1B1xrS6Xi6uhCoXcH8UzSETk81S2pmpWjQ";
  const uAdr = m.wAdr || borgAdr;

  // Fetch balances
  let masterBal = await PTree.peerPaysGetMyBalance(borgAdr);
  let userBal   = await PTree.peerPaysGetMyBalance(uAdr);

  console.log(`doSendBorgPayRecentTrans():: masterBal `,masterBal);

  masterBal = masterBal.json.balance;
  userBal   = userBal.json.balance;

  // Fetch transactions
  const trans = await PTree.peerPaysGetMyTrans(uAdr);

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

  // Return to HUI
  const j = {
    action  : "sendAccountInfo",
    result  : true,
    name    : 'Joe Blow',
    balance : `${userBal.balance.toFixed(3)} BORG Shells - Confirms: ${userBal.confirms}`,
    icon    : 'http://localhost/netREQ/msg=%7B%22req%22:%22getFileFromRepo%22,%22url%22:%22/whzon/bitMiner/getFileFromRepo.php?wzID=DESKTOP&fname=portMale17.jpg&rname=myOtherRepo&path=&ownerMUID=1GAMYVZBDa42Rse5a8rxajzvXiXwN35EQZ&folderID=0&encrypt=0%22,%22checkSum%22:%22cc97009add696816ff58af3f34a9a44c615d8a8ef529fe21696de957d9eeecd3%22,%22ftype%22:%22image/jpeg%22,%22PIN%22:%22TEST_PIN_2x49fg16%22}',
    html    : htm,
    js      : "",
    jsID    : wallet.calculateHash(htm),
    pMUID   : "1B1xrS6Xi6uhCoXcH8UzSETk81S2pmpWjQ"
  };
  return j;
}
module.exports = {
  // utils
  doSendBorgPayRecentTrans
};

