<?php
include_once('borgPHPInc.php');
function mkySrvRoot(){
  $path = $_SERVER['DOCUMENT_ROOT'];
  return $path;
}
function exitLogInject($data,$fld){
  global $userID;
  global $userName;
  $IP = safeSRV('REMOTE_ADDR');
  $SC = safeSRV('SCRIPT_NAME');
  $m  = '<h3>Alert Sent: </h3>';
  $m .= 'IP: '.$IP;
  $m .= '<br/>USER: '.$userID.' '.$userName;
  $m .= '<br/>Script: '.$SC;
  $m .= '<br/>Field: '.$fld;
  $m .= '<br/>Data: '.$data;
  echo $m;
  //mailAdmin('peter@bitmonky.com', 'SQL Inject Alert:',$m);  
  exit('<p/>done');
}
function stripNum($n){
  $n = mkyStrReplace('$','',$n);
  $n = mkyStrReplace(',','',$n);
  return $n;
}
function safeGetINT($fld){
  if (!isset($_GET[$fld])){
    return null;
  }
  if (strtoupper($_GET[$fld]) == 'UNDEFINED'){
    return null;
  }
  if ($_GET[$fld] == ''){
    return 0;
  }
  $id = stripNum($_GET[$fld]);
  if (abs($id) > 9223372036854775808){
    exitLogInject($id,$fld);
  }
  if(preg_match("/^-?[0-9]+$/", $id)) {
    return addslashes($id);
  }
  else {
    exitLogInject($id,$fld);
  }
}
function safeGET($name){
  if (isset($_GET[$name])){
    return clean($_GET[$name]);
  }
  return null;
}
function safePOST($name){
  if (isset($_POST[$name])){
    return clean($_POST[$name]);
  }
  return null;
}
function safeSRV($name){
  if (isset($_SERVER[$name])){
    return clean($_SERVER[$name]);
  }
  return null;
}
function safeCOOK($name){
  if (isset($_COOKIE[$name])){
    return clean($_COOKIE[$name]);
  }
  return null;
}
function removeSess($cname){
  setcookie( $cname, '', time() - 3600, "/", ".bitmonky.com" );
}
function clean($str){
  global $userID;
  if ($str === null) {
    return "";
  }
  else{
    $str=mkyTrim($str);

     $str=mkyStrReplace("*",".",$str);
     $str=mkyStrReplace("--","..",$str);
     $str=mkyStrReplace(";",":",$str);
     $str=mkyStrReplace("<","",$str);
     $str=mkyStrReplace("'","`",$str);
     $str=mkyStrReplace('"','`',$str);
     $str=mkyStrReplace("}","",$str);
     $str=mkyStrReplace("{","",$str);

     $str=mkyStrReplace('&#39','',$str);
     $str=mkyStrReplace('&#34','',$str);
     $str=mkyStrReplace('&#45','',$str);
     $str=mkyStrReplace('&#60','',$str);
     $str=mkyStrReplace('&#92','',$str);
     $str=mkyStrReplace('&#35','',$str);
     $str=mkyStrReplace('&#38','',$str);
     $str=mkyStrIReplace('&lt','',$str);
     $str=mkyStrIReplace('&quot','',$str);
     $str=mkyStrIReplace('&apos','',$str);

     $str=mkyStrIReplace('&#x22','',$str); // "
     $str=mkyStrIReplace('&#x27','',$str); // '
     $str=mkyStrIReplace('&#x26','',$str); // ;
     $str=mkyStrIReplace('&#x23','',$str); // -
     $str=mkyStrIReplace('&#x2d','',$str); // #
     $str=mkyStrIReplace('&#x3b','',$str); // &
     $str=mkyStrIReplace('&#x3c','',$str); // <
     $str=mkyStrIReplace('&#x5c','',$str); // \


     $str=addslashes($str);
     return $str;
  }
}
?>
