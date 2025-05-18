<?php
ini_set('memory_limit', '256M');
ini_set('display_errors',1);
error_reporting(E_ALL);
include_once('borgSess.php');
$time_pre = microtime(true);


/***********************************
initialize with your shardTree wallet address.
*/
$mbrMUID = safeGET('ownerMUID');
if (!$mbrMUID){
  $mbrMUID = "1GAMYVZBDa42Rse5a8rxajzvXiXwN35EQZ";
}
$rname    = safeGET('rname');
$fname    = safeGET('fname');
$path     = safeGET('path');
$folderID = safeGET('folderID');
$encrypt  = safeGET('encrypt');
if (!$encrypt){
  $encrypt = 0;
}
$fd  =  ftreeGetFileFromRepo($mbrMUID,$rname,$fname,$path,$folderID);
$time_post = microtime(true);
$tTime = $time_post - $time_pre;

if (!$fd){
  exit ('Node::ftreeGetFileFromRep:Failed');
}  
$f = $fd->data;

$f = json_decode($f);
if (!$f->result){
  exit('FILE_NOTFOUMD.:'.$fd->file.' Not Found');
}

$fcheckSum = $f->file->fileInfo->checkSum;
$ftype     = $f->file->fileInfo->fileType;

// if Browser sent ID, we check if they match


$headers = apache_request_headers();
if (isset($headers['If-None-Match'])){ $ifmatch = $headers['If-None-Match'];} else { $ifmatch = '';}

if ($fcheckSum){
  if (preg_match("#$fcheckSum#",$ifmatch)) {
    header('HTTP/1.1 304 Not Modified');
    exit('');
  }
}

$FILE = new stdClass;
$FILE->owner    = $mbrMUID;
$FILE->filename = $fname;
$FILE->ftype    = $ftype;
$FILE->encrypt  = $encrypt;
$FILE->shards   = $f->file->shards;
$FILE->checksum = $fcheckSum;

$target_dir = "/var/www/repoTempFiles/downloads/";
$tmpname    = $target_dir.$FILE->checksum.'.tmp';
$cacheName  = str_replace('.tmp','.cache',$tmpname);

// If chache has file use that instead;

if (file_exists($cacheName)) {
  sendToBrowser($cacheName,$fcheckSum,$ftype,$fname);
  exit('');
}

// Open the file and truncate the contents in preperation.
$handle = fopen($tmpname, 'wb');
if ($handle){
  fclose($handle);
  $handle = null;
}

$maxConcurrentRequests = 3;  // Adjust based on your system's capacity
$chunkSize = 256 * 1024;     // 256 KB per chunk
$sTracker = [];

$tempShards = $FILE->shards;

$trys = 1;
while (count($tempShards) > 0 && $trys <= 25){
  $r = fastReadFromTree($mbrMUID,$tempShards,$tmpname,$chunkSize,$maxConcurrentRequests);
  foreach ($tempShards as $key => $s) {
    if (in_array($s->shardID, $GLOBALS['sTracker'])) {
      unset($tempShards[$key]);
    }
  }
  $trys = $trys + 1;
}  

if ($ftype === null){
  $ftype = 'image/png';
}
if (!file_exists($tmpname)) {
    die('File not found.');
}

sendToBrowser($tmpname,$fcheckSum,$ftype,$fname);

// cache the file by renaming it
rename($tmpname, $cacheName);


function sendToBrowser($tmpname,$fcheckSum,$ftype,$fname){
  // Get the file's size and name
  $fileSize = filesize($tmpname);

  header("ETag: \"$fcheckSum\"");
  header("Accept-Ranges: bytes");
  header("Content-Type: ".$ftype);
  header("Content-Length: ".$fileSize);
  header("Content-Disposition: inline; filename=\"/$fname\";");

  // Read the file and send it to the browser
  readfile($tmpname);
}  
function fastReadFromTree($muid,$shards,$fname,$chunkSize=256*1024,$maxConections=25){
  $res = openFileForWritingShards($fname,$shards,$chunkSize);
  if ($res->result) {
    $results = fastReadFileShards($muid,$res->fmap,$res->fhandle,$chunkSize,$maxConections);
  }
  fclose($res->fhandle);

  $fres = new stdClass;
  $fres->nShards = $results;
  $fres->smap      = $res;
  return $fres;
}
function openFileForWritingShards($fname,$shards, $chunkSize) {
    $filePath = $fname;

    // Open the file in binary write mode
    $handle = fopen($filePath, 'cb');
    //echo "<h3>Try Open $filePath</h3>";
    if (!$handle) {
       exit("error: file not opened;<p/>"); 
       return null;
    }

    $shardIndex = 0;
    $fmap = [];

    forEach ($shards as $shard) {
        // Read the chunk
        $smap = new stdClass;

        $smap->Result   = false;
        $smap->shardID  = $shard->shardID;
        $smap->startPos = $shardIndex * $chunkSize;
        $smap->nStored  = 0;
        $smap->index    = $shardIndex;
        $smap->shard    = null;

	array_push($fmap, $smap);

        $shardIndex++;
    }

    $res = new stdClass;
    $res->result = true;
    $res->fmap = $shards;
    $res->fhandle = $handle;
    return $res; // Return the result object
}
function fastReadFileShards($muid,$fmap, $fhandle, $chunkSize, $maxConcurrentRequests = 20,$nCopys=3,$encrypt=0,$expires=null) {

   if ($encrypt == 0){
     $encrypt = null;
   }
   $j = new stdClass;
   $j->ownerID   = $muid;
   $j->hash      = null;
   $j->encrypted = $encrypt;
    
    $mh = curl_multi_init();
    $handles = [];
    $retrys  = [];
    $i = 0;
    $results = new stdClass;
    $results->nShards = 0;

    $postDataArray = [];
    $exeT = 4.0;

    foreach ($fmap as $map) {
        $j->hash = $map->shardID;
        if (count($handles) >= $maxConcurrentRequests) {
            // Wait for some handles to complete
            $running = null;
            do {
                curl_multi_exec($mh, $running);
                curl_multi_select($mh,$exeT);
	    } while ($running >= $maxConcurrentRequests);

            foreach ($handles as $key => $ch) {
                $response = curl_multi_getcontent($ch);
                $info = curl_getinfo($ch);
		/*
		echo "<br/>http_code::".$info['http_code'];
		echo "<br/>download_content_length::".$info['download_content_length'];
		echo "<br/>size_download::".$info['size_download'];
		echo "<br/>";
		*/
		if ($info['http_code'] != 200) {
		  //echo "Job :: $key Status ".$info['http_code'];	
		  if ($info['http_code'] != 0) {
		    array_push($retrys,$postDataArray[$key]);
		  }
                }   
                else if ($info['download_content_length'] == $info['size_download']) {
		  procRemoteReads($response,$fmap,$fhandle);
		  $i = $i + 1;
		  curl_multi_remove_handle($mh, $ch);
                  curl_close($ch);
                  unset($handles[$key]);
                }
            }
        }
        $ch = curl_init();
        //curl_setopt($ch, CURLOPT_URL, "https://web.bitmonky.com/whzon/bitMiner/fastReadTest.php");
        curl_setopt($ch, CURLOPT_URL, $GLOBALS['PTC_shardRECEPTOR'] . "/netREQ");
        curl_setopt($ch, CURLOPT_POST, 1);
	curl_setopt($ch, CURLOPT_VERBOSE, true);
	curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60); // 30 seconds
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 50); // 10 seconds
        $postData =  json_encode(['msg' => ['req' => 'requestShard', 'sIndex' => $i, 'shard' => $j]]);
	$postDataArray[] = $postData; // Save the POST data along with the key
	curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        curl_multi_add_handle($mh, $ch);
        $handles[] = $ch;
    }

    // Process remaining handles
    $running = null;
    do {
        curl_multi_exec($mh, $running);
 	curl_multi_select($mh,$exeT);
    } while ($running > 0);

    foreach ($handles as $ch) {
        $response = curl_multi_getcontent($ch);
        $info = curl_getinfo($ch);
        if ($info['http_code'] != 200) {
          if ($info['http_code'] != 0) {
            array_push($retrys,$postDataArray[$key]);
	  }
	}
        else if ($info['download_content_length'] == $info['size_download']) {
	   procRemoteReads($response,$fmap,$fhandle);
	   $i = $i + 1;
           curl_multi_remove_handle($mh, $ch);
           curl_close($ch);
        }	   
    }

    curl_multi_close($mh);
    
    foreach ($retrys as $data){
      //echo "<br/>".$data;
    }
    return $i;
}
function procRemoteReads($res,$fmap,$fhandle){
   $r = json_decode($res);     
   if (!$r){
     return;
   }

   if ($r->result==1){
     if (!in_array($r->data->qry->shard->hash, $GLOBALS['sTracker'])) {
       array_push($GLOBALS['sTracker'],$r->data->qry->shard->hash);	    
       $shardID     = $r->data->qry->shard->hash;
       $encrypted   = $r->data->qry->shard->encrypted;
       $filepointer = getShardFPtr($shardID,$fmap);
       $shard       = $r->data->data;
       writeShardDataFile($fhandle,$filepointer,$shard);
     }  
   }
}	
function getShardFptr($shardID,$fmap){
   forEach($fmap as $shard){
     if ($shard->shardID == $shardID){
       return $shard->fposition;
     }
   }    
   return null;
}
function writeShardDataFile($handle, $startPosition, $shard, $chunkSize = 8192) {
    // Move the file pointer to the starting position
    fseek($handle, $startPosition);

    // Open a stream for decoding the base64 data
    $decodedStream = base64_decode($shard, true); // Decodes the entire shard

    if ($decodedStream === false) {
        throw new Exception("Base64 decoding failed!");
    }

    $dataLength = strlen($decodedStream);
    $written = 0;

    // Write the decoded data in chunks
    while ($written < $dataLength) {
        $chunk = substr($decodedStream, $written, $chunkSize);
        fwrite($handle, $chunk);
        $written += $chunkSize;
    }

    // Ensure data is flushed to the file
    fflush($handle);
}
?>
