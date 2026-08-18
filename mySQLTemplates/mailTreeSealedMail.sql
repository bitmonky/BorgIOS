-- ---------------------------------------------------------------------------
-- mailTree: end to end encrypted mail
-- ---------------------------------------------------------------------------
-- Migration for mailTree databases created before sealed mail. New installs get
-- this from mailTreeTpl.sql; run this on existing cells:
--
--   mysql mailTree < mailTreeSealedMail.sql
--
-- msubMailPubKey is the recipient's RSA mail key. A sender fetches it with
-- getInBoxKey, wraps a one-time message key to it, and encrypts the body with
-- that key, so the cell holding the mail cannot read it.

ALTER TABLE `mailTree`.`mailSubscriber`
  ADD COLUMN IF NOT EXISTS `msubMailPubKey` text DEFAULT NULL AFTER `msubPubKey`;

CREATE TABLE IF NOT EXISTS `mailTree`.`mailInBox` (
  `mbxID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `mbxToMUID` varchar(64) NOT NULL,
  `mbxFromMUID` varchar(64) DEFAULT NULL,
  `mbxHash` char(64) NOT NULL,
  `mbxEnvelope` mediumtext NOT NULL,
  `mbxSig` text DEFAULT NULL,
  `mbxDate` bigint(20) DEFAULT NULL,      -- ms epoch, sender's cronoTree clock
  `mbxStored` bigint(20) DEFAULT NULL,    -- ms epoch, this cell's cronoTree clock
  PRIMARY KEY (`mbxID`),
  -- the envelope hash is the mail's identity: a resend or a second copy
  -- request must not create a duplicate row
  UNIQUE KEY `ndxMbxToHash` (`mbxToMUID`,`mbxHash`),
  KEY `ndxMbxTo` (`mbxToMUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
