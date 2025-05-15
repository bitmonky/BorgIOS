<?php
//exit('tests');
ini_set('memory_limit', '256M');

include_once("borgSess.php");
ini_set('display_errors',1);
error_reporting(E_ALL);
$time_pre = microtime(true);

//$MKYC_ShowSQLTimer = true;
//echo "<h2>Starting Test File Storage On PeerTree</h2>\n";

/***********************************
initialize with your shardTree wallet address.
*/
$mbrMUID = safeGET('ownerMUID');
if (!$mbrMUID){
  $mbrMUID = "1GAMYVZBDa42Rse5a8rxajzvXiXwN35EQZ";
}
$rname   = safeGET('rname');
$fname   = safeGET('fname');
$path    = safeGET('path');
$folderID = safeGET('folderID');
$encrypt  = safeGET('encrypt');
if (!$encrypt){
  $encrypt = 0;
}

$fd  =  ftreeGetFileFromRepo($mbrMUID,$rname,$fname,$path,$folderID);
if (!$fd){
  exit ('Node::ftreeGetFileFromRep:Failed');
}  
$f = $fd->data;
//exit( "<p/>File:: ".$f);

$f = json_decode($f);
if (!$f->result){
  exit('File:'.$fd->file.' Not Found');
}

$fcheckSum = $f->file->fileInfo->checkSum;
//echo('<p/>CheckSum::'.$fcheckSum);
$ftype     = $f->file->fileInfo->fileType;

// if Browser sent ID, we check if they match


$headers = apache_request_headers();
if (isset($headers['If-None-Match'])){ $ifmatch = $headers['If-None-Match'];} else { $ifmatch = '';}

if ($fcheckSum){
  if (preg_match("#$fcheckSum#",$ifmatch)) {
    header('HTTP/1.1 304 Not Modified');
        //exit('');
  }
  else {
    if (isset($_COOKIE['wzDSMode'])){
      header('Location: https://image.bitmonky.com/img/wzDSmode.png');
      exit('');
    }
  }
}


$fdata = '';
$x=1;
//echo "Nshards=".count($f->file->shards);

forEach($f->file->shards as $rec){
   $j = ptreeRequestShard($mbrMUID,$rec->shardID,$encrypt);
   //var_dump($j);
   //ob_start();
   //echo ("\n<br/>".$x." - start".$rec->shardID);
   $data = mkyStrReplace('"{','{',$j->data);
   $data = mkyStrReplace('}"','}',$data);
   $jres = json_decode($data);
   //$bstr = implode(array_map("chr", $jres->data->data->data));
   $bstr = $jres->data->data;
   $fdata .= base64_decode($bstr);
   //echo "\n<br/>done:".$bstr;
   //ob_flush();
   //flush();
   $x=$x+1;
}
//exit("\n\n<p/>Tada!");
if ($ftype === null){
  $ftype = 'image/png';
}
header("ETag: \"$fcheckSum\"");
header("Accept-Ranges: bytes");
header("Content-Type: ".$ftype);
header("Content-Disposition: inline; filename=\"/fileFromTree.png\";");
echo $fdata;
//echo  "<br/>".hash('sha256',$fdata);
?>
