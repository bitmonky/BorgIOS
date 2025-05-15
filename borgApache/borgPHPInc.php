<?php
$MKYC_SQLtimer       = 4;
$MKYC_ShowSQLTimer   = null;                   // Utility for SQL execution time debuging

function mkyStrToNum($str){
  $nbr = 1 * str_replace(',','',''.$str);
  return $nbr;
}
function mkyJEncode($J){
  return json_encode($J,JSON_INVALID_UTF8_SUBSTITUTE);
}
function mkyUrlEncode($str){
  if($str === null) {return;}
  return urlencode($str);
}
function mkyNumFormat($nbr,$n=0,$decSym='.',$thoSym=','){
  if($nbr === null) {$nbr=0;}
  if($n === null)   {$n=0;}
  return number_format($nbr,$n,$decSym,$thoSym);
}
function mkyStrReplace($find,$replace,$str){
  if($find === null || $replace === null || $str === null){
    return $str;
  }
  return str_replace($find,$replace,$str);
}
function mkyStrIReplace($find,$replace,$str){
  if($find === null || $replace === null || $str === null){
    return $str;
  }
  return str_ireplace($find,$replace,$str);
}
function mkyStripos($hay,$str,$offset=0){
  if($str === null || $hay === null){
    return false;
  }
  return stripos($hay,$str,$offset);
}
function mkyStrpos($hay,$str,$offset=0){
  if($str === null || $hay === null){
    return false;
  }
  return strpos($hay,$str,$offset);
}
function mkyTrim($str){
  if($str === null){
    return null;
  }
  return trim($str);
}
function fxnToStr($s){
  if ($s === null){
    return '';
  }
  return $s;
}
function fxnToZero($n){
  if ($n === null){
    return 0;
  }
  return $n;
}
function left($str, $length) {
  if ($str === null){return null;}
  return substr($str, 0, $length);
}
function utf8Fits($inputString, $maxLength) {
    if ($inputString === null){
      return null;
    }    
    // Check if the input string is UTF-8 encoded
    if (mb_check_encoding($inputString, 'UTF-8')) {
        // Get the length of the UTF-8 string
        $stringLength = mb_strlen($inputString, 'UTF-8');

        // Compare the length to the specified maximum length
        if ($stringLength <= $maxLength) {
            return true; // The string is within the maximum length
        } else {
            return false; // The string is too long
        }
    } else {
        return false; // The input is not a valid UTF-8 string
    }
}
function utf8MakeFit($str, $len) {
    if ($str === null){
      return null;
    }
    // Check if the input string is UTF-8 encoded
    if (mb_check_encoding($str, 'UTF-8')) {
        // Get the length of the UTF-8 string
        $stringLength = mb_strlen($str, 'UTF-8');
        
        // If the string is shorter than the specified length, no need to shorten it
        if ($stringLength <= $len) {
            return $str;
        }
        
        // Find the last space within the specified length
        $lastSpace = mb_strrpos(mb_substr($str, 0, $len, 'UTF-8'), ' ', 0, 'UTF-8');
        
        if ($lastSpace !== false) {
            // Shorten the string to the last space within the specified length
            $shortenedStr = mb_substr($str, 0, $lastSpace, 'UTF-8');
            return $shortenedStr;
        } else {
            // If no space found within the specified length, simply truncate the string
            return mb_substr($str, 0, $len, 'UTF-8');
        }
    } else {
        // The input is not a valid UTF-8 string
        return null;
    }
}
function checkFixWebsiteURL($url,$matchDom=null) {
      if ($url === null){
	return null;
      }
      $url = trim($url);
      if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return null;
      }
      if (strpos($url, 'https://') !== 0) {
        return null;
      }
      $urlParts = parse_url($url);
      if (isset($urlParts['host'])) {
         if ($matchDom){
           if (strtolower($matchDom) != strtolower($urlParts['host'])){
             return false;
	   }
	 }
         return 'https://'.$urlParts['host'];
      }
      return null;
}
?>
