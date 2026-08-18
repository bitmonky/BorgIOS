# Multi-cell mailTree sealed-mail runtime test plan

## Lab (already up)
- `docker compose` in `/home/ubuntu/mailtree-src/nodeJS/test/mailtree`
- 4 real mailTree cells `mt-m1..mt-m4` at 198.51.101.11-.14, receptor 13395, each running
  `mailTreeCell.js` + a co-located `cronoTreeCell.js` (localhost:13397).
- 4 independent MariaDB instances `mt-db1..mt-db4`, each with its own `mailTree` +
  `shellFarmer` schema built from the repo templates under test.
- Verified: every DB's `mailTree.mailCells` shows the other cells `online`.

## Client harness (host side, to write): `client/suite.js`
- EC secp256k1 wallet identical to borgHUIconduit: privKey -> pubKey -> MUID =
  bitcoin p2pkh address; borgToken = {reqId, reqTime, Address, sesTok:`MUID-reqTime-reqId`,
  pubKey, sesSig: DER hex sign(sha256(sesTok))}.
- RSA 4096 mail keys (spki/pem) as mkyRSAMail.generateKeys does.
- Seal/open with `/home/ubuntu/repos/borgHUI/borgHUImailCrypto.js` **unmodified** (required).
- POST `https://<cellIP>:13395/netREQ` with `{msg:{...}, borgToken}`, TLS unverified.
- Request shapes mirror borgHUIptreeAPI.js: registerInBox(+mailPubKey), getInBoxKey,
  sendMail(mail.envelope,nCopys), listMyMail, getMyMail(hash), deleteMail(hash).

## Assertions
1. **Registration** — register MUID-A and MUID-B via cell m1; PASS if `mailSubscriber.msubMailPubKey`
   on >=1 cell DB equals the client's RSA public key PEM for each MUID (and msubPubKey = EC pubkey).
2. **Key lookup** — `getInBoxKey(B)` through m2 (a cell that is not the one asked to register);
   PASS if returned mailPubKey === B's RSA PEM exactly.
3. **Send / 3 copies** — A seals mail to B, `sendMail` nCopys=3 via m1; PASS if response
   nStored=3 and exactly 3 of the 4 DBs contain one `mailInBox` row with the same mbxHash
   (and the 4th has none) => 3 distinct holder cells, one hash.
   Also check `mbxDate`/`mbxStored` are BIGINT ms epoch (~now, not NULL, not datetime string).
4. **Opacity** — grep every holder DB row dump and every cell container log for the plaintext
   subject/body markers; PASS if zero hits (marker strings are unique random tokens).
5. **Retrieval + decrypt** — B `listMyMail` via m4; PASS if exactly one logical message returned,
   response reports holders/hosts info, and `openMail` with B's RSA private key returns the
   exact original {subject, body}.
6. **Failover** — `docker stop` one holder cell; B retrieves again; PASS if the mail is still
   returned exactly once and decrypts.
7. **Dedupe** — A resends the identical envelope; PASS if no holder DB gains a second row for
   (mbxToMUID, mbxHash) and previously stored rows keep their original mbxStored.
8. **Authorization** — third MUID C `listMyMail` (own MUID) and `getMyMail(hashOfBsMail)`;
   PASS if C receives no envelopes.
9. **Delete** — B `deleteMail(hash)`; PASS if every DB has 0 rows for that hash afterwards.

## Evidence
- Per-assertion console transcript to `/home/ubuntu/mailtree-src/nodeJS/test/mailtree/artifacts/suite.log`
- DB dumps per cell before/after each step, cell logs.
- No recording (shell/Docker/API only, no GUI).

## Rules
- No modification of crypto/auth/server code to make anything pass; bugs get reported.
