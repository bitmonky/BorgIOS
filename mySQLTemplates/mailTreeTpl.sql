-- MySQL dump 10.14  Distrib 5.5.52-MariaDB, for Linux (x86_64)
--
-- Host: localhost    Database: mailTree
-- ------------------------------------------------------
-- Server version	5.5.52-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `mailBox`
--

DROP TABLE IF EXISTS `mailBox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mailBox` (
  `mboxID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `mboxSubID` bigint(20) DEFAULT NULL,
  `mboxFromAddress` varchar(64) DEFAULT NULL,
  `mboxMsgCipher` varchar(64) DEFAULT NULL,
  `mboxMsg` text,
  PRIMARY KEY (`mboxID`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mailBox`
--

LOCK TABLES `mailBox` WRITE;
/*!40000 ALTER TABLE `mailBox` DISABLE KEYS */;
/*!40000 ALTER TABLE `mailBox` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mailCells`
--

DROP TABLE IF EXISTS `mailCells`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mailCells` (
  `mcelID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `mcelAddress` varchar(64) DEFAULT NULL,
  `mcelLastStatus` varchar(20) DEFAULT NULL,
  `mcelLastMsg` datetime DEFAULT NULL,
  `mcelOwnMUID` varchar(84) DEFAULT NULL,
  PRIMARY KEY (`mcelID`),
  KEY `ndxMcelAddress` (`mcelAddress`),
  KEY `ndxMcelLastStatus` (`mcelLastStatus`),
  KEY `ndxMcelLastMsg` (`mcelLastMsg`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mailCells`
--

LOCK TABLES `mailCells` WRITE;
/*!40000 ALTER TABLE `mailCells` DISABLE KEYS */;
/*!40000 ALTER TABLE `mailCells` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mailSubscriber`
--

DROP TABLE IF EXISTS `mailSubscriber`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mailSubscriber` (
  `msubID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `msubMUID` varchar(64) DEFAULT NULL,
  `msubPubKey` text DEFAULT NULL,
  `msubIconFName` varchar(284) DEFAULT NULL,
  `msubIconFCSum` varchar(84) DEFAULT NULL,
  `msubIconRName` varchar(284) DEFAULT NULL,
  `msubIconFolder` bigint(20) DEFAULT NULL,
  `msubIconPath` varchar(1045) DEFAULT NULL,
  `msubIconFType` varchar(50) DEFAULT NULL,
  `msubBorgNic` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`msubID`),
  KEY `ndxMsubMUID` (`msubMUID`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mailSubscriber`
--

LOCK TABLES `shellFarmerRegistry` WRITE;
/*!40000 ALTER TABLE `shellFarmerRegistry` DISABLE KEYS */;
/*!40000 ALTER TABLE `shellFarmerRegistry` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `shellFarmerRegistry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `shellFarmerRegistry` (
  `sregID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sregFarmerMUID` varchar(84) NOT NULL,
  `sregFarmerFIP`  varchar(130) NOT NULL,
  `sregRegDate` datetime DEFAULT NULL,
  PRIMARY KEY (`sregID`),
  KEY `ndxSregFarmerMUID` (`sregFarmerMUID`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tblwzMUID`
--

DROP TABLE IF EXISTS `tblwzMUID`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;

CREATE TABLE `tblwzMUID` (
  `muidID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `muidWzUserID` bigint(20) DEFAULT NULL,
  `muidMUID` varchar(84) DEFAULT NULL,
  `muidToken` varchar(64) DEFAULT NULL,
  `muidTokenDate` datetime DEFAULT NULL,
  `muidPubKey` varchar(145) DEFAULT NULL,
  `muidNonce` varchar(64) DEFAULT NULL,
  `muidAccLock` int(11) DEFAULT NULL,
  `muidSignature` varchar(145) DEFAULT NULL,
  `muidTLastLogin` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`muidID`),
  UNIQUE KEY `muidID_UNIQUE` (`muidID`),
  UNIQUE KEY `muidMUID_UNIQUE` (`muidMUID`),
  KEY `ndxMuidWzUserID` (`muidWzUserID`),
  KEY `ndxMuidNonce` (`muidNonce`)
) ENGINE=InnoDB AUTO_INCREMENT=65619 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_czech_ci;

/*!40101 SET character_set_client = @saved_cs_client */;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2023-02-14 21:00:18
