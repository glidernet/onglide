-- MySQL dump 10.13  Distrib 5.7.30, for FreeBSD12.1 (amd64)
--
-- Host: localhost    Database: dsample19
-- ------------------------------------------------------
-- Server version	5.7.30-log

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
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED='8bd8a256-d699-11e6-8a3a-00259071d4aa:1-913267473';

--
-- Table structure for table `comprules`
--

DROP TABLE IF EXISTS `comprules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `comprules` (
  `name` char(20) NOT NULL DEFAULT '',
  `country` char(2) NOT NULL DEFAULT '',
  `ypercentageW` float DEFAULT NULL,
  `ypercentageU` float DEFAULT NULL,
  `minY` int(11) DEFAULT NULL,
  `maxY` int(11) DEFAULT NULL,
  `contestWindDivisionFactor` float DEFAULT NULL,
  `Da` int(11) DEFAULT NULL,
  `Ta` int(11) DEFAULT NULL,
  `handicapped` char(1) DEFAULT 'N',
  `mauw` char(1) DEFAULT 'Y',
  `hcapmodifiers` char(1) DEFAULT 'N',
  `grandprixstart` char(1) DEFAULT 'N',
  PRIMARY KEY (`country`,`name`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comprules`
--

LOCK TABLES `comprules` WRITE;
/*!40000 ALTER TABLE `comprules` DISABLE KEYS */;
INSERT INTO `comprules` VALUES ('Open','UK',0.5,0,100,200,1.18,250,200,'N','Y','N','N'),('18m','UK',0.5,0,90,180,1.1,250,200,'N','Y','N','N'),('15m','UK',0.5,0,90,180,1.04,250,200,'N','Y','N','N'),('Standard','UK',0.5,0,80,160,1,250,200,'N','Y','N','N'),('Club','UK',0.5,0,80,160,1,250,200,'Y','Y','Y','N'),('HCap','UK',0.5,0,80,160,1,250,200,'Y','Y','N','N'),('Junior','UK',0,0.4,60,120,1,0,0,'Y','Y','Y','N'),('Regionals','UK',0,0.4,60,120,1,0,0,'Y','N','Y','N'),('20m','UK',0.5,0,90,180,1.04,250,200,'N','Y','N','N'),('15_meter','CZ',0,0,0,0,0,0,0,'Y','N','N','N'),('club','CZ',0,0,0,0,0,0,0,'Y','N','N','N'),('open','CZ',0,0,0,0,0,0,0,'Y','Y','N','N'),('grandprix','SK',0,0,0,0,0,0,0,'N','N','N','Y'),('grandprix','UK',0,0,0,0,0,0,0,'N','N','N','Y'),('double_seater','CZ',0,0,0,0,0,0,0,'N','N','N','Y'),('standard','CZ',0,0,0,0,0,0,0,'N','N','N','Y'),('grandprix','CL',0,0,0,0,0,0,0,'N','N','N','Y'),('15_meter','SK',0,0,0,0,0,0,0,'N','N','N','N'),('club','SK',0,0,0,0,0,0,0,'Y','N','N','N'),('standard','SK',0,0,0,0,0,0,0,'N','N','N','N');
/*!40000 ALTER TABLE `comprules` ENABLE KEYS */;
UNLOCK TABLES;
--
-- Table structure for table `classes`
--

DROP TABLE IF EXISTS `classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `classes` (
  `class` char(15) NOT NULL,
  `classname` char(15) NOT NULL,
  `description` varchar(200) DEFAULT '',
  `type` char(20) DEFAULT NULL,
  UNIQUE KEY `class` (`class`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `compdayshelper`
--

DROP TABLE IF EXISTS `compdayshelper`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `compdayshelper` (
  `year` int(11) DEFAULT NULL,
  `month` int(11) DEFAULT NULL,
  `day` int(11) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `competition`
--

DROP TABLE IF EXISTS `competition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `competition` (
  `name` varchar(60) DEFAULT NULL,
  `sitename` varchar(100) DEFAULT NULL,
  `start` date DEFAULT NULL,
  `end` date DEFAULT NULL,
  `shortname` char(15) DEFAULT NULL,
  `club` varchar(60) DEFAULT NULL,
  `organiseremail` varchar(200) DEFAULT NULL,
  `controlemail` varchar(200) DEFAULT NULL,
  `frameheader` text,
  `bodystyle` text,
  `maintablestyle` text,
  `localrulesavailable` varchar(200) DEFAULT NULL,
  `maxentries` int(11) DEFAULT '50',
  `deposit` float DEFAULT NULL,
  `depositdue` date DEFAULT NULL,
  `total` float DEFAULT NULL,
  `totaldue` date DEFAULT NULL,
  `launches` float DEFAULT NULL,
  `paypalemail` char(100) DEFAULT NULL,
  `paymentaddress` text,
  `notes` text,
  `declaration` text,
  `listen` char(1) DEFAULT 'N',
  `hometp` char(4) DEFAULT 'DUN',
  `previousyears` text,
  `siteroot` varchar(120) DEFAULT NULL,
  `currentyear` char(2) DEFAULT NULL,
  `gallery` text,
  `webcam` text,
  `twitter` text,
  `flickrset` text,
  `flickrowner` text,
  `handicaps` char(1) DEFAULT 'Y',
  `control` char(12) DEFAULT NULL,
  `gridorderavailable` char(1) DEFAULT 'Y',
  `seeyoubasename` text,
  `countrycode` char(2) DEFAULT 'UK',
  `tzoffset` int(11) DEFAULT NULL,
  `websubmission` char(1) DEFAULT 'N',
  `tz` char(6) DEFAULT '+1:00',
  `twitwidget` char(60) DEFAULT NULL,
  `capturecars` char(1) DEFAULT 'N',
  `capturederigging` char(1) DEFAULT 'N',
  `requirefullpayment` char(1) DEFAULT 'N',
  `compstatus` char(1) DEFAULT 'Y',
  `noresults` char(1) DEFAULT 'Y',
  `mainwebsite` varchar(120) DEFAULT NULL,
  `lt` float DEFAULT NULL,
  `lg` float DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `compstatus`
--

DROP TABLE IF EXISTS `compstatus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `compstatus` (
  `datecode` char(3) DEFAULT NULL COMMENT 'current contest date code for this class',
  `status` char(1) DEFAULT '?' COMMENT 'what is happening with this class (?=prereg,W=waitlist,X=confirm reg,P=prebrief,B=afterbrief,L=launched,S=startopen/flying,R=all reported,H=all home,Z=scrubbed,O=comp over',
  `briefing` time DEFAULT '10:00:00' COMMENT 'what time is briefing',
  `launching` time DEFAULT '11:00:00' COMMENT 'what time is launching',
  `gridbefore` char(1) DEFAULT 'Y' COMMENT 'Y/N grid before or after briefing',
  `probability` int(11) DEFAULT NULL,
  `weather` varchar(300) DEFAULT NULL,
  `resultsdatecode` char(3) DEFAULT NULL COMMENT 'what date is scoring up to with uploading, results after this date wont be displayed',
  `task` char(1) DEFAULT 'A' COMMENT 'selected task',
  `class` char(15) NOT NULL,
  `starttime` time DEFAULT NULL,
  `startheight` int(11) DEFAULT '0',
  `winddir` int(11) DEFAULT '0',
  `windspeed` int(11) DEFAULT '0',
  `compdate` date DEFAULT NULL,
  `briefdc` char(4) DEFAULT NULL,
  `grid` char(20) DEFAULT '',
  UNIQUE KEY `class` (`class`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contestday`
--

DROP TABLE IF EXISTS `contestday`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `contestday` (
  `class` char(15) NOT NULL DEFAULT '',
  `datecode` char(4) NOT NULL,
  `daynumber` int(11) NOT NULL DEFAULT '0' COMMENT 'Calculated at briefing for the day, may be more than one with same number',
  `calendardate` date DEFAULT NULL,
  `turnpoints` char(200) DEFAULT NULL COMMENT 'csv list of turnpoints',
  `tasktime` char(30) DEFAULT NULL COMMENT 'aat: length of task in time',
  `script` char(60) DEFAULT NULL COMMENT 'description of the task',
  `length` char(30) DEFAULT NULL COMMENT 'speed: distance',
  `result_type` char(30) DEFAULT 'Estimated' COMMENT 'output from scoring, is the result unconfirmed, etc',
  `results_uploaded` datetime DEFAULT NULL,
  `info` char(255) DEFAULT NULL COMMENT 'Messages output about the task',
  `status` char(1) DEFAULT 'N' COMMENT 'What happened with the day - Y = contest, Z = scrubbed, N = not yet flown',
  `comments` varchar(600) DEFAULT NULL,
  `igcavailable` char(1) DEFAULT 'N' COMMENT 'Are there any IGC files for this day Y/N',
  `windspeed` int(11) DEFAULT NULL,
  `winddir` int(11) DEFAULT NULL,
  `maxspeed` int(11) DEFAULT '95',
  `minspeed` int(11) DEFAULT '65',
  `notes` text,
  PRIMARY KEY (`class`,`datecode`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `errorlog`
--

DROP TABLE IF EXISTS `errorlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `errorlog` (
  `at` datetime NOT NULL,
  `msg` text,
  `page` text,
  `querycompno` char(4) DEFAULT NULL,
  `realusername` char(30) DEFAULT NULL,
  `queryuser` char(30) DEFAULT NULL,
  `extra1` text,
  `extra2` text
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `images`
--

DROP TABLE IF EXISTS `images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `images` (
  `type` char(10) DEFAULT NULL,
  `filename` varchar(60) NOT NULL,
  `keyid` char(20) DEFAULT NULL,
  `width` int(11) DEFAULT NULL,
  `height` int(11) DEFAULT NULL,
  `status` char(1) DEFAULT 'P',
  `description` text,
  `title` text,
  `added` datetime DEFAULT NULL,
  `papersize` char(10) DEFAULT 'none',
  PRIMARY KEY (`filename`),
  KEY `typeindex` (`type`),
  KEY `keyidx` (`type`,`keyid`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `logindetails`
--

DROP TABLE IF EXISTS `logindetails`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `logindetails` (
  `username` varchar(160) NOT NULL DEFAULT '',
  `password` tinyblob,
  `displayname` char(60) DEFAULT NULL,
  `pilot` char(4) DEFAULT NULL,
  `type` char(1) NOT NULL,
  `mobilenumber` char(20) DEFAULT NULL,
  `blogable` char(1) DEFAULT 'Y',
  `originalpw` text,
  `mobilekey` text NOT NULL,
  PRIMARY KEY (`username`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg`
--

DROP TABLE IF EXISTS `msg`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `msg` (
  `msg` text
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `pilotresult`
--

DROP TABLE IF EXISTS `pilotresult`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pilotresult` (
  `class` char(15) NOT NULL,
  `datecode` char(3) NOT NULL,
  `compno` char(4) NOT NULL,
  `pilot` int(11) DEFAULT NULL,
  `takeoff` time DEFAULT NULL,
  `start` time DEFAULT NULL,
  `finish` time DEFAULT NULL,
  `duration` time DEFAULT NULL,
  `distance` float DEFAULT NULL,
  `loLAT` float DEFAULT NULL,
  `loLONG` float DEFAULT NULL,
  `turnpoints` int(11) DEFAULT NULL,
  `loNotes` varchar(6000) DEFAULT NULL,
  `status` char(1) DEFAULT NULL,
  `hspeed` float DEFAULT NULL,
  `hdistance` float DEFAULT NULL,
  `htaskdistance` float DEFAULT NULL,
  `penalty` int(11) DEFAULT NULL,
  `daypoints` int(11) DEFAULT '0',
  `dayrank` int(11) DEFAULT NULL,
  `totalpoints` int(11) DEFAULT '0',
  `totalrank` int(11) DEFAULT NULL,
  `loReported` datetime DEFAULT NULL,
  `statuschanged` datetime DEFAULT NULL,
  `speed` float DEFAULT NULL,
  `loOriginal` time DEFAULT NULL,
  `loNear` varchar(60) DEFAULT NULL,
  `gliderok` char(1) DEFAULT '',
  `youok` char(1) DEFAULT '',
  `igcavailable` char(1) DEFAULT 'Y',
  `land` time DEFAULT NULL,
  `scoredstatus` char(1) DEFAULT 'S',
  `datafromscoring` char(1) NOT NULL DEFAULT 'N',
  `prevtotalrank` int(11) DEFAULT NULL,
  `forcetp` int(11) DEFAULT NULL,
  `forcetptime` datetime DEFAULT NULL,
  PRIMARY KEY (`class`,`datecode`,`compno`),
  KEY `class` (`class`),
  KEY `datecode` (`datecode`),
  KEY `compno` (`compno`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pilots`
--

DROP TABLE IF EXISTS `pilots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pilots` (
  `fai` int(11) DEFAULT '0',
  `firstname` char(30) DEFAULT NULL,
  `lastname` char(30) DEFAULT NULL,
  `homeclub` char(80) DEFAULT NULL,
  `username` varchar(160) DEFAULT NULL,
  `postcode` char(9) DEFAULT NULL,
  `mobile` char(15) DEFAULT NULL,
  `email` varchar(160) DEFAULT NULL,
  `address` varchar(300) DEFAULT NULL,
  `totalhours` int(11) DEFAULT NULL,
  `othercomps` varchar(255) DEFAULT NULL,
  `displayother` char(1) DEFAULT 'N',
  `rtlexpiry` date DEFAULT NULL,
  `mapchecked` char(1) DEFAULT 'N',
  `insurancechecked` char(1) DEFAULT 'N',
  `registered` char(1) DEFAULT 'N',
  `paid` char(1) DEFAULT 'N',
  `kinname` varchar(40) DEFAULT NULL,
  `kinrelationship` varchar(40) DEFAULT NULL,
  `kinaddress` varchar(300) DEFAULT NULL,
  `kinnumbers` varchar(80) DEFAULT NULL,
  `compno` char(4) NOT NULL,
  `p2` char(40) DEFAULT NULL,
  `glidertype` char(30) DEFAULT 'CHOOSE',
  `wingspan` float DEFAULT NULL,
  `class` char(15) NOT NULL DEFAULT '',
  `handicap` double(4,1) DEFAULT NULL,
  `loggersticker` char(1) DEFAULT NULL,
  `faichecked` char(1) DEFAULT NULL,
  `turbo` char(1) DEFAULT NULL,
  `participating` char(1) DEFAULT NULL,
  `gridorder` int(11) DEFAULT NULL,
  `country` char(2) DEFAULT 'GB',
  `image` varchar(20) DEFAULT NULL,
  `registereddt` datetime DEFAULT NULL,
  `greg` char(8) DEFAULT NULL,
  `fairings` char(1) DEFAULT '?',
  `winglets` char(1) DEFAULT '?',
  `p2fai` int(11) DEFAULT NULL,
  `turbulator` char(1) DEFAULT '?',
  `flarm` char(1) DEFAULT NULL,
  `twitter` char(30) DEFAULT NULL,
  `vehicles` varchar(300) DEFAULT NULL,
  `derigging` char(1) DEFAULT '?',
  `mauw` int(11) DEFAULT NULL,
  PRIMARY KEY (`class`,`compno`),
  UNIQUE KEY `username` (`username`),
  KEY `fai` (`fai`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;


--
-- Table structure for table `soaringspotkey`
--

DROP TABLE IF EXISTS `soaringspotkey`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `soaringspotkey` (
  `client_id` char(120) NOT NULL,
  `secret` char(120) NOT NULL,
  `contest_name` char(120) DEFAULT NULL,
  `overwrite` int(11) DEFAULT '0',
  `actuals` int(11) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `taskleg`
--

DROP TABLE IF EXISTS `taskleg`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `taskleg` (
  `class` char(15) NOT NULL DEFAULT '',
  `datecode` char(3) NOT NULL,
  `taskid` int(11) NOT NULL,
  `legno` int(11) NOT NULL DEFAULT '0',
  `length` float DEFAULT NULL,
  `bearing` int(11) DEFAULT NULL,
  `nlat` float DEFAULT NULL,
  `nlng` float DEFAULT NULL,
  `Hi` float DEFAULT NULL,
  `ntrigraph` char(4) DEFAULT NULL,
  `nname` char(80) DEFAULT NULL,
  `wleglength` float DEFAULT NULL,
  `type` enum('sector','line','thistle') DEFAULT NULL,
  `direction` enum('fixed','np','symmetrical','pp','sp') DEFAULT NULL,
  `r1` float DEFAULT NULL,
  `a1` int(11) DEFAULT NULL,
  `r2` float DEFAULT NULL,
  `a2` int(11) DEFAULT NULL,
  `a12` float DEFAULT NULL,
  `quicktype` char(20) DEFAULT 'BGA Sector',
  PRIMARY KEY (`taskid`,`legno`),
  KEY `class` (`class`,`datecode`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tasks`
--

DROP TABLE IF EXISTS `tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tasks` (
  `datecode` char(3) NOT NULL,
  `class` char(15) DEFAULT NULL,
  `task` char(1) DEFAULT NULL,
  `flown` char(1) DEFAULT 'N',
  `description` text,
  `distance` float DEFAULT NULL,
  `hdistance` float DEFAULT NULL,
  `duration` time DEFAULT NULL,
  `type` char(1) DEFAULT 'S',
  `taskid` int(11) NOT NULL AUTO_INCREMENT,
  `maxmarkingdistance` float DEFAULT NULL,
  PRIMARY KEY (`taskid`),
  UNIQUE KEY `integrity` (`class`,`datecode`,`task`),
  KEY `class` (`class`)
) ENGINE=MyISAM AUTO_INCREMENT=152937 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tracker`
--

DROP TABLE IF EXISTS `tracker`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tracker` (
  `compno` char(4) NOT NULL,
  `type` enum('flarm','delorme','spot','none') DEFAULT NULL,
  `feedid` text,
  `password` text,
  `trackerid` text,
  `class` char(15) NOT NULL DEFAULT '',
  PRIMARY KEY (`class`,`compno`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `trackerhistory`
--

DROP TABLE IF EXISTS `trackerhistory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `trackerhistory` (
  `compno` char(4) DEFAULT NULL,
  `changed` datetime DEFAULT NULL,
  `flarmid` char(10) DEFAULT NULL,
  `greg` char(12) DEFAULT NULL,
  `launchtime` time DEFAULT NULL,
  `method` enum('none','startline','pilot','ognddb') DEFAULT 'none'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `trackpoints`
--

DROP TABLE IF EXISTS `trackpoints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `trackpoints` (
  `compno` char(4) NOT NULL,
  `class` char(20) DEFAULT NULL,
  `datecode` char(3) NOT NULL,
  `lat` float NOT NULL,
  `lng` float NOT NULL,
  `altitude` int(11) NOT NULL,
  `agl` int(11) NOT NULL,
  `t` int(11) NOT NULL DEFAULT '0',
  UNIQUE KEY `cda` (`datecode`,`class`,`compno`,`t`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lostatushelper`
--

DROP TABLE IF EXISTS `lostatushelper`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `lostatushelper` (
  `status` char(1) NOT NULL DEFAULT '',
  `briefname` char(14) NOT NULL,
  `description` char(40) DEFAULT NULL,
  `image` varchar(100) DEFAULT 'outline.gif',
  `icon` char(30) DEFAULT NULL,
  `after` char(10) NOT NULL,
  `afterbrief` char(6) NOT NULL,
  `actionrequired` char(1) DEFAULT NULL,
  `summary` char(30) DEFAULT NULL,
  `verb` text,
  `pilotafter` char(10) DEFAULT NULL,
  `inputrequired` char(1) DEFAULT 'N',
  PRIMARY KEY (`status`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lostatushelper`
--

LOCK TABLES `lostatushelper` WRITE;
/*!40000 ALTER TABLE `lostatushelper` DISABLE KEYS */;
INSERT INTO `lostatushelper` VALUES ('-','not yet','Not Launched','trailers.jpg',NULL,'','','N',NULL,'','','N'),('Z','scrubbed','Day Scrubbed','windsock.jpg',NULL,'','','N',NULL,'','','N'),('G','grid','Grid / Launched','grid.jpg','cloud-upload','RCHWSDF/','RWHD','N','Flying','','RCLHWSD','N'),('S','started','Started','leaving.jpg','time','RCWH','RWH','N','Started','','RCLHWSD','N'),('R','reported','Reported In','InField.jpg','phone','CLOHAW','CLOH','Y','Landed Out or Home','Report Landout','CLOH','Y'),('W','a/t request','A/T Requested','tugrequest.jpg','plane time','ARCH','ARCH','Y','Landed Out or Home','Request A/T','ARCLOH','Y'),('C','enroute','Crew enroute','enroute.jpg','truck','LOH','LOH','Y','Landed Out or Home','Report Landout, Crew Enroute Already','','M'),('L','linked','Crew linked','Linked.jpg','thumbs-up-alt','OH','OH','N','Landed Out or Home','Report Landout, Crew Arrived Already','','M'),('A','a/t returning','A/T Returning','AeroTow.jpg','plane','H','H','N','Landed Out or Home','','','M'),('O','returning','Returning','mirrorview.jpg','road','H','H','N','Landed Out or Home','','','M'),('H','home','Home','beer.jpg','home','GSD','GSD','N','Landed Out or Home','Report pilot home after landout or local flying','','N'),('F','finished','Finished','finisher.jpg','trophy','HRW','HRW','N','Finished','','','N'),('D','did not fly','Didn\'t fly','trailers.jpg','anchor','GSH','GSH','N',NULL,'Pilot did not take a launch','','N'),('/','withdrawn','Withdrawn','trailers.jpg','trash','','','N',NULL,'','','N');
/*!40000 ALTER TABLE `lostatushelper` ENABLE KEYS */;
UNLOCK TABLES;


--
-- Table structure for table `pilotlostatushelper`
--

DROP TABLE IF EXISTS `pilotlostatushelper`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pilotlostatushelper` (
  `status` char(1) NOT NULL DEFAULT '',
  `briefname` char(14) NOT NULL,
  `description` char(40) DEFAULT NULL,
  `image` varchar(100) DEFAULT 'outline.gif',
  `after` char(10) NOT NULL,
  PRIMARY KEY (`status`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pilotlostatushelper`
--

LOCK TABLES `pilotlostatushelper` WRITE;
/*!40000 ALTER TABLE `pilotlostatushelper` DISABLE KEYS */;
INSERT INTO `pilotlostatushelper` VALUES ('-','not yet','Not Launched','trailers.jpg',''),('Z','scrubbed','Day Scrubbed','windsock.jpg',''),('G','grid','Grid / Launched','grid.jpg','RCHWD'),('S','started','Started','leaving.jpg','RCHW'),('R','reported','Landout Reported','InField.jpg','CLOHAW'),('W','a/t request','A/T Requested','tugrequest.jpg','ARCH'),('C','enroute','Crew enroute','enroute.jpg','LOH'),('L','linked','Linked with crew','Linked.jpg','OH'),('A','a/t returning','A/T Returning','AeroTow.jpg','H'),('O','returning','Returning Home','mirrorview.jpg','H'),('H','home','Home','beer.jpg','D'),('F','finished','Finished','finisher.jpg','HRW'),('D','didn\'t fly','Didn\'t fly','trailers.jpg','H'),('/','withdrawn','Withdrawn','trailers.jpg','');
/*!40000 ALTER TABLE `pilotlostatushelper` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sectortypes`
--

DROP TABLE IF EXISTS `sectortypes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sectortypes` (
  `countrycode` char(2) DEFAULT NULL,
  `name` char(20) DEFAULT NULL,
  `defaults` char(40) DEFAULT NULL,
  KEY `st` (`countrycode`,`name`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sectortypes`
--

LOCK TABLES `sectortypes` WRITE;
/*!40000 ALTER TABLE `sectortypes` DISABLE KEYS */;
INSERT INTO `sectortypes` VALUES ('UK','Start Sector','sector,np,5,90,0,0,0'),('UK','BGA Sector','sector,symmetrical,20,45,0.5,180,0'),('UK','BGA Enhanced Sector','sector,symmetrical,10,90,0.5,180,0'),('UK','AAT','sector,symmetrical,20,180,0,0,2'),('UK','Finish Line','line,pp,2,90,0,0,1'),('UK','Finish Ring','sector,pp,3,180,0,0,1'),('UK','DH Sector','sector,symmetrical,20,45,5,180,0'),('UK','DH Enhanced Sector','sector,symmetrical,10,90,5,180,0'),('CZ','Start Line','line,np,5,90,0,0,1'),('CZ','Sector','sector,symmetrical,0.5,180,0,0,1'),('CZ','Finish Ring','sector,pp,3,180,0,0,1'),('CZ','AAT','sector,symmetrical,20,180,0,0,2'),('CZ','Hack Start','sector,np,5,90,0,0,0'),('SK','Start','sector,np,5,90,0,0,0'),('SK','Finish Ring','sector,np,3,180,0,0,0'),('SK','Barrel','sector,np,0.5,180,0,0,0'),('SK','Finish Line','sector,pp,2,90,0,0,1'),('SK','Start Line','line,pp,5,90,0,0,1');
/*!40000 ALTER TABLE `sectortypes` ENABLE KEYS */;
UNLOCK TABLES;


SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
-- Dump completed on 2020-07-10 17:15:03
