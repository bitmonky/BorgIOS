<?php
//ini_set('display_errors',1);
//error_reporting(E_ALL);

function ptreeMakeSearchKey($j){
  return hash('sha256',json_encode($j));
}
$PTC_memRECEPTOR    = "https://172.105.110.34:1335";
$PTC_shardRECEPTOR  = "https://139.177.195.184:13355";
$PTC_shardRECEPTOR2 = "https://139.177.195.184:13355";
$PTC_ftreeRECEPTOR  = "https://139.177.195.184:13381"; 
$PTC_mailRECEPTOR   = "https://139.177.195.184:13395";
$PTC_peerPaysRECEPTOR  = "https://172.105.22.200:13392";
$PTC_maxWordLength  = 45;
include_once('peerMemComWordsInc.php');
function prepWords($str){
  if ($str === null || mkyTrim($str) == ''){
    return null;
  }
  $str = ' '.$str.' ';

  $words = json_decode($GLOBALS['comWords']);
  forEach($words as $word){
    //echo $word->word.", ";
    $str = str_ireplace(' '.$word->word.' ',' ',$str);
  }
  $str = mkyTrim($str);
  $str   = preg_replace("/[\p{P}\p{S}]+/u", " ", $str);
  $str   = mb_strtolower($str);
  $str   = str_replace(" s ",'s ',$str);

  // Shorten long words
  $list  = explode(' ',$str);
  $n=0;$newStr = null;
  forEach ($list as $word){
    $word = left($word,$GLOBALS['PTC_maxWordLength']);
    if ($n==0){
      $n=1;
      $newStr = $word;
    }
    else {
      if (mkyTrim($word) != ''){
        $newStr .= ' '.$word;
      }
    }
  } 
  if (strlen($newStr)==0){
    return null;
  }
  return $newStr;
}
function locateMyMasterRepo($muid){
   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"locateMyMasterRepo","ownMUID":"'.$muid.'"}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function peerMailGetMyMsgs($muid,$sig){
   $req = new stdClass;
     $req->req     = 'getMyMail';
     $req->ownMUID = $toMuid;
     $req->sig     = $sig;

   $post->url   = $GLOBALS['PTC_mailRECEPTOR']."/netREQ";
   $post->postd = json_encode(["msg" => $req]);

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function peerMailSendMsg($toMuid,$mail,$sig){
   $req = new stdClass;
     $req->req    = 'sendMail';
     $req->toMUID = $toMuid;
     $req->sig    = $sig;
     $req->mail   = $mail;
      
   $post->url   = $GLOBALS['PTC_mailRECEPTOR']."/netREQ";
   $post->postd = json_encode(["msg" => $req]);

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function peerMailGetInboxKey($muid){
   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_mailRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"getInBoxKey","ownMUID":"'.$muid.'"}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}	
function peerMailRegisterInBox($muid,$token,$publicKey,$sig){
   return; // Remove when mailTreeCelll completed.
   $p = new stdClass;
     $p->inboxMUID = $muid;
     $p->nCopies   = 3;

     $s = new stdClass;
       $s->ownMUID   = $muid; 
       $s->signature = $sig;
       $s->token     = $token;
       $s->pubKey    = $publicKey;
     
     $p->sig   = $s;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_mailRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"registerInBox",'.json_encode($p).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function peerPaysMakeUserTrans($muid,$toMuid,$amount,$sig){
   $p = new stdClass;
   $p->pacID = 1;
   $p->to = $toMuid;
   $p->from = $muid;
   $p->amount = $amount;
   $p->unixTime = round(microtime(true) * 1000);
   $p->date = date('Y-m-d H:i:s', round($p->unixTime/1000));
   $p->status = 0;
   $p->signature = $sig;
   $p->signKey = 'xxxxx';
   $p->tx = makeTx($p);
   $p->nCopies = 2;
   
   $j = new stdClass;
   $j->from    = $muid;
   $j->payment = $p;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_peerPaysRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"makeUserTransaction","userUID":"'.$muid.'","trans":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function makeTx($p){
   $txStr = json_encode($p);
   return hash('SHA256',$txStr);
}
function peerPaysGetMyBalance($muid){
   $j = new stdClass;
   $j->from    = $muid;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_peerPaysRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"getUserBalance","userUID":"'.$muid.'"}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function peerPaysGetMyTrans($muid){
   $j = new stdClass;
   $j->from    = $muid;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_peerPaysRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"getUserTransactions","userUID":"'.$muid.'"}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ftreeCreateRepo($muid,$name,$nCopys){
   $j = new stdClass;
   $j->from      = $muid;
   $j->name      = $name;
   $j->nCopys    = 0 + $nCopys;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"createRepo","repo":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ftreeCreateRepoFolder($muid,$name,$folder,$parent){
   $j = new stdClass;
   $j->from      = $muid;
   $j->name      = $name;
   $j->folder    = $folder;
   $j->parent    = $parent;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"createRepoFolder","repo":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}	
function ftreeGetMyRepos($muid){
   $j = new stdClass;
   $j->from      = $muid;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"getMyRepoList","repo":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ftreeGetMyRepoPath($muid,$name,$fname,$folderID){
   $j = new stdClass;
   $j->from     = $muid;
   $j->name     = $name;
   $j->fname    = $fname;
   $j->folderID = $folderID;
   //echo json_encode($j);
   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"getMyRepoFilePath","repo":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ftreeGetMyRepoFiles($muid,$name,$fparentID=null){
   $j = new stdClass;
   $j->from      = $muid;
   $j->name      = $name;
   $j->parentID  = $fparentID;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"getMyRepoFiles","repo":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ftreeGetFileFromRepo($muid,$name,$file,$path,$folderID){
   $j = new stdClass;
   $j->from      = $muid;
   $j->name      = $name;
   $j->file      = $file;
   $j->path      = $path;
   $j->folderID  = $folderID;
   if ($j->path !== '/'){
     $j->path = preg_replace('/\//', '', $j->path, 1);
   }
   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"getRepoFileData","repo":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ftreeInsertFileToRepo($muid,$name,$file,$path,$folderID,$nCopys){
   $j = new stdClass;
   $j->from      = $muid;
   $j->name      = $name;
   $j->file      = $file;
   $j->path      = $path;
   $j->folderID  = $folderID;
   $j->nCopys    = 0 + $nCopys;

   if ($j->path !== '/'){
     $j->path = preg_replace('/\//', '', $j->path, 1);
   }

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"insertRSfile","repo":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ftreeDeleteFileFromRepo($muid,$name,$file,$path,$nCopys=3){
   $j = new stdClass;
   $j->from      = $muid;
   $j->name      = $name;
   $j->file      = $file;
   $j->path      = $path;
   if (is_string($nCopys)) {
     $nCopys = (int) $nCopys;
   }
   $j->nCopys    = $nCopys;

   if ($j->path !== '/'){
     $j->path = preg_replace('/\//', '', $j->path, 1);
   }

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_ftreeRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"deleteRSfile","repo":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ptreeStoreShard($muid,$hash,$shard,$encrypt=null,$nCopys=3,$expires=null){
   if ($encrypt == 0){
     $encrypt = null;
   }	
   $j = new stdClass;
   $j->from      = $muid;
   $j->hash      = $hash;
   $j->hashID    = hash('sha256',''.$hash.$muid.time());
   $j->data      = $shard;
   $j->encrypt   = $encrypt;
   $j->expires   = $expires;
   $j->nCopys    = 0 + $nCopys;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_shardRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"storeShard","shard":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ptreeRequestShard($muid,$hash,$hashID,$encrypted=null){
   $j = new stdClass;
   $j->ownerID   = $muid;
   $j->hash      = $hash;
   $j->hashID    = $hashID;
   $j->encrypted = $encrypted;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_shardRECEPTOR']."/netREQ";
   //$post->url   = $GLOBALS['PTC_shardRECEPTOR2']."/netREQ";
   $post->postd = '{"msg":{"req":"requestShard","shard":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ptreeDeleteShard($muid,$hash,$hashID,$encrypted=null,$nCopys=3){
   $j = new stdClass;
   $j->ownerID   = $muid;
   $j->hash      = $hash;
   $j->hashID    = $hashID;
   $j->nCopys    = 0 + $nCopys;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_shardRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"deleteShard","shard":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function ptreeSearchMem($muid,$str,$type,$scope=null,$scopeID=null,$qryLimit=null,$qryOrder=null){
     
   $j = new stdClass;
   $j->ownerID   = $muid;
   $j->qryStr    = $str;
   $j->qryType   = $type;
   $j->qryStyle  = 'bestMatch';
   $j->timestamp = time();
   $j->reqScore  = 0.0005;
   $j->nResults  = 100;
   $j->nRows     = 15;
   $j->pg        = 1;
   if ($scope){
     $j->scope   = str_replace('my','',strtolower($scope));
     $j->scopeID = $scopeID;
   }  
   $j->qryLimit = ' limit 40';
   if ($qryLimit){
     $j->qryLimit = $qryLimit;
   }
   
   if ($qryOrder){
     $j->qryOrder = $qryOrder;
   }
   $j->key       = ptreeMakeSearchKey($j);

   $u = new stdClass;
   $u->url = $GLOBALS['PTC_memRECEPTOR'].'/netREQ/msg='.mkyUrlEncode('{"req":"searchMemory","qry":'.json_encode($j).'}');
   $bcRes = tryFetchURL($u->url,1);
   return $bcRes;
}
function ptreeStoreMem($muid,$acID,$str,$type='generic',$nCopys=3,$weights=null,$location=null){
   $j = new stdClass;
   $j->from    = $muid;
   $j->memID   = $acID;
   $j->memStr  = $str;
   $j->memType = $type;
   $j->nCopys  = $nCopys;
   $j->weights = $weights;
   if ($location){
     $j->cityID        = $location->cityID;
     $j->stateID       = $location->stateID;
     $j->countryID     = $location->countryID;
     $j->worldRegionID = $location->worldRegionID;
     $j->date          = $location->date;
   }  
   $u = new stdClass;
   $u->url = $GLOBALS['PTC_memRECEPTOR'].'/netREQ/msg='.mkyUrlEncode('{"req":"storeMemory","memory":'.json_encode($j).'}');
   //echo 'LOGING{"req":"storeMemory","memory":'.json_encode($j).'}';
   $bcRes = tryFetchURL($u->url,1);
   return $bcRes;
}
function ptreeDeleteMem($muid,$memHash){
   $j = new stdClass;
   $j->ownMUID   = $muid;
   $j->memoryID  = $memHash;
   $j->nCopys    = 0;

   $post = new stdClass;
   $post->url   = $GLOBALS['PTC_shardRECEPTOR']."/netREQ";
   $post->postd = '{"msg":{"req":"removeMemory","memory":'.json_encode($j).'}}';

   $bcRes = tryJFetchURL($post,'POST');
   return $bcRes;
}
function tryJFetchURL($j,$method='GET',$timeout=5,$excTimeout=180){
    if (stripos($j->url, 'http') !== 0) { 
      $prot   = "https://";
      $domain = $_SERVER['HTTP_HOST'];
      $j->url = $prot.$domain.$j->url;
    }
    $resp = new stdClass;
    $crl = curl_init();
    curl_setopt ($crl, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt ($crl, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt ($crl, CURLOPT_SSL_VERIFYPEER, 0);
    curl_setopt ($crl, CURLOPT_URL,$j->url);
    curl_setopt ($crl, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt ($crl, CURLOPT_CONNECTTIMEOUT, $timeout);
    curl_setopt ($crl, CURLOPT_TIMEOUT, $excTimeout);
    curl_setopt ($crl, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt ($crl, CURLOPT_USERAGENT,safeSRV('HTTP_USER_AGENT'));
    curl_setopt ($crl, CURLOPT_MAXREDIRS,5);
    curl_setopt ($crl, CURLOPT_REFERER, 'https://monkytalk/');
    curl_setopt ($crl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
    if ($method == 'POST'){
      $j->post = "sending post data:".$j->postd;
      curl_setopt ($crl, CURLOPT_POSTFIELDS, $j->postd);
    }

    curl_setopt ($crl, CURLOPT_HTTPHEADER , array(
      'accept: application/json',
      'content-type: application/json')
    );

    $resp->data  = curl_exec($crl);
    if ($resp->data === null) {
      $resp->data = "Document tryJFetchURL  ".$j->url." Failed";
    }

    $resp->error = false;
    if ($resp->data === false) {
      $resp->error = curl_error($crl);
    }
    else {
      $info = curl_getinfo($crl);
      $resp->rcode = $info['http_code'];
      $resp->furl  = curl_getinfo($crl, CURLINFO_EFFECTIVE_URL);
    }
    curl_close($crl);
    return $resp;
}
function checkFileLoadProgress($fmap,$try,$max=3){
  $total   = count($fmap);	
  $nStored = 0;
  $pend    = 0;
  echo "<br/>File Load Progress - Pass: ".$try;
  echo "<br/>Total Shards: ".$total;
  forEach($fmap as $srd){ 
    if ($srd->nStored == $max) {$nStored = $nStored +1;}
    else {$pend = $pend + 1;}
  }
  echo " Shards Saved: ".$nStored;
  echo " Pending: " .$pend;
  return $total - $nStored;

}	
function fastStoreToTree($muid,$fname,$chunkSize=256*1024,$maxConections=25){
  $fhash = getFileSha256($fname);
  $res = mapFileForSharding($fname,$chunkSize);

  $pass    = 1;
  $status  = 1; //checkFileLoadProgress($res->shards,$pass);
  $maxPass = 12;
  while ( $status > 0 && $pass <= $maxPass){
    $results = fastStoreFile($muid,$res->shards,$res->fhandle,$chunkSize,$pass,$maxConections);
    $status  = checkFileLoadProgress($res->shards,$pass);
    $pass = $pass +1;
  }    
  fclose($res->fhandle);

  if ($status > 0){
    echo "<br/>Backing Out Shard Storage Transactions:";   
    //$tracker = [];
    //fastDeleteFileShards($muid,$res->shards,$maxConections,$tracker);
    fastDeleteShardsMultyTry($muid,$res->shards,$maxConections);
    echo "Backout Complete!<p/>";
    return null;
  }

  $fres = new stdClass;
  $fres->remoteRes = $results;
  $fres->smap      = $res;
  $fres->chksum    = $fhash;
  return $fres;
}

function getFileSha256($filePath, $chunkSize = 8192) {
    // Open the file in binary read mode
    $handle = fopen($filePath, 'rb');
    if (!$handle) {
        throw new Exception("Failed to open file: $filePath");
    }

    // Initialize the hash context
    $hashContext = hash_init('sha256');

    // Read the file in chunks and update the hash
    while (!feof($handle)) {
        $chunk = fread($handle, $chunkSize);
        hash_update($hashContext, $chunk);
    }

    // Finalize the hash and close the file
    $hash = hash_final($hashContext);
    fclose($handle);

    return $hash;
}
function fastStoreFile($muid,$shards, $fhandle, $chunkSize,$pass,$maxConcurrentRequests = 20,$nCopys=3,$encrypt=0,$expires=null) {

   if ($encrypt == 0){
     $encrypt = null;
   }
   $j = new stdClass;
   $j->from      = $muid;
   $j->hash      = null;
   $j->data      = null;
   $j->encrypt   = $encrypt;
   $j->expires   = $expires;
   $j->nCopys    = 0 + $nCopys;
   $j->pass      = $pass;

   $mh = curl_multi_init();
    $handles = [];
    $i = 0;
    $results = [];
    foreach ($shards as $shard) {
      $pending = $nCopys - $shard->nStored; 
      if ($pending > 0){
        $shardData  = fetchShardDataB64($fhandle, $shards[$i]->startPos, $chunkSize, $i);
        $j->data    = $shardData;
	$j->hash    = $shard->shardID;
	$j->hashID  = $shard->shardHID;
	$j->fptr    = $shard->startPos;
	$j->nCopys  = $pending;
	$j->xIP     = array_column($shard->hosts, "ip");

	if (empty($shardData)) {
            throw new Exception("Shard data is empty for shard $i");
        }

        if (count($handles) >= $maxConcurrentRequests) {
            // Wait for some handles to complete
            $running = null;
            do {
                curl_multi_exec($mh, $running);
                curl_multi_select($mh);
            } while ($running >= $maxConcurrentRequests);

            // Process completed handles
            foreach ($handles as $key => $ch) {
                $response = curl_multi_getcontent($ch);
                $info = curl_getinfo($ch);
                if ($info['http_code'] != 200) {
                  //echo "<br/>Error: " . curl_error($ch) . " Status: " . $info['http_code'];
                }
                else {
                  array_push($results,$response);
		  procRemoteResults($response,$shards);
		  curl_multi_remove_handle($mh, $ch);
                  curl_close($ch);
                  unset($handles[$key]);
                }
            }
        }

        $ch = curl_init();
        //curl_setopt($ch, CURLOPT_URL, "https://web.bitmonky.com/whzon/bitMiner/fastTreeTest.php");
        curl_setopt($ch, CURLOPT_URL, $GLOBALS['PTC_shardRECEPTOR'] . "/netREQ");
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
        curl_setopt($ch, CURLOPT_TIMEOUT, 260); // 260 seconds
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10); // 10 seconds
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['msg' => ['req' => 'storeShard', 'sIndex' => $i, 'shard' => $j]]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        curl_multi_add_handle($mh, $ch);
        $handles[] = $ch;
      }
      $i++;
    }

    // Process remaining handles
    $running = null;
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh);
    } while ($running > 0);

    foreach ($handles as $ch) {
        $response = curl_multi_getcontent($ch);
        $info = curl_getinfo($ch);
        if ($info['http_code'] != 200) {
            //echo "<br/>Error: " . curl_error($ch) . " Status: " . $info['http_code'];
        } else {
           array_push($results,$response);
	   procRemoteResults($response,$shards);
	}
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }

    curl_multi_close($mh);
    return $results;
}
function procRemoteResults($res,$shards){
    $r = json_decode($res);
    if (!$r){
      return;
    } 	    
    if (isset($r->result)){
      if (isset($r->shardID)){
        forEach ($shards as $shard){
  	   if ($shard->shardID == $r->shardID){
	     $shard->Result   = $r->result;
	     $shard->nStored  = $shard->nStored + $r->nStored;
	     $shard->hosts    = array_merge($shard->hosts,$r->hosts);
             return;
     	   }
        }
      }
      else {
        echo "R->shard is missing in R:".$res;
      }
    }      
}
function mapFileForSharding($fname, $chunkSize) {
    $filePath = $fname;

    // Open the file in binary read mode
    $handle = fopen($filePath, 'rb');
    if (!$handle) {
       echo "File Handle Not Found:$filePath";
       return null;
    }

    $shardIndex = 0;
    $shards = [];

    while (!feof($handle)) {
        // Read the chunk
        $smap = new stdClass;

        $chunk = fread($handle, $chunkSize);

        // Skip empty chunks (e.g., at the end of the file)
        if (empty($chunk)) {
            break;
        }

        // Process the chunk (e.g., encode, hash, store)
        $shard = base64_encode($chunk);
        $smap->Result   = false;
	$smap->shardID  = hash('sha256', $shard);
        $smap->startPos = $shardIndex * $chunkSize;
	$smap->nStored  = 0;
	$smap->index    = $shardIndex;
	$smap->hosts    = [];
        $smap->shardHID = hash('sha256',''.$smap->shardID.$smap->startPos.$fname.time());
	array_push($shards, $smap);

        $shardIndex++;
    }

    $res = new stdClass;
    $res->result = true;
    $res->shards = $shards;
    $res->fhandle = $handle;
    return $res; // Return the result object
}
function fetchShardDataB64($handle, $startPosition, $chunkSize, $shardIndex) {
    // Move the file pointer to the starting position
    fseek($handle, $startPosition);

    // Read the chunk
    $chunk = fread($handle, $chunkSize);

    // Process the chunk (e.g., encode, hash, store)
    return base64_encode($chunk); // Removed "return =" syntax error
}
function fastDeleteShardsMultyTry($mbrMUID,$fmap,$maxConections=25,$maxTrys=25,$fname='failedUpLoadBackout.shards'){
   $maxConcurrentRequests = $maxConections;
   $sTracker = [];

   $tempShards = $fmap;

   $trys = 1;
   while (count($tempShards) > 0 && $trys <= $maxTrys){
     $r = fastDeleteFileShards($mbrMUID,$tempShards,$maxConcurrentRequests,$sTracker);
     foreach ($tempShards as $key => $s) {
       if (in_array($s->shardID, $sTracker)) {
         unset($tempShards[$key]);
       }
     }
     $trys = $trys + 1;
   }
   echo "Message From Borg .: \nFile $fname Deleted";
   return 0;
}
function fastDeleteFileShards($muid,$fmap,$maxConcurrentRequests = 20,&$sTracker) {

   $j = new stdClass;
   $j->ownerID   = $muid;
   $j->hash      = null;

    $mh = curl_multi_init();
    $handles = [];
    $retrys  = [];
    $i = 0;
    $results = new stdClass;
    $results->nShards = 0;

    $postDataArray = [];
    $exeT = 4.0;

    foreach ($fmap as $map) {
        $j->hash   = $map->shardID;
        $j->hashID = $map->shardHID;
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
                if ($info['http_code'] != 200) {
                  //echo '<br/>res::http_code: '.$info['http_code'];
                }
                else { //if ($info['download_content_length'] == $info['size_download']) {
                  processRemoteDelResults($response,$fmap,$sTracker);
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
        $postData =  json_encode(['msg' => ['req' => 'deleteShard', 'sIndex' => $i, 'shard' => $j]]);
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
          echo '<br/>Remaining:::Res::http_code: '.$info['http_code'];
        }
        else { //if ($info['download_content_length'] == $info['size_download']) {
           processRemoteDelResults($response,$fmap,$sTracker);
           $i = $i + 1;
           curl_multi_remove_handle($mh, $ch);
           curl_close($ch);
        }
    }

    curl_multi_close($mh);

    return $i;
}
function processRemoteDelResults($res,$fmap,&$sTracker){
   gfbug("BORG:::processRemoteDel::res: $res");  
   $r = json_decode($res);
   if (!$r){
     return;
   }

   if ($r->result==1){
     if (!in_array($r->shardID, $sTracker)) {
       gfbug("BORG::sTracker:push $r->shardID");    
       array_push($sTracker,$r->shardID);
     }
   }
}
?>
