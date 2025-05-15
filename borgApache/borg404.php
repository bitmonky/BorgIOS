<?php
// borg404.php - Dynamic Resource Fetcher with Redirect
//exit( "borg404");
//session_start();
ini_set('memory_limit', '256M');
ini_set('display_errors',1);
error_reporting(E_ALL);
include_once('peerReceptorAccess.php');

$mbrMUID = "1GAMYVZBDa42Rse5a8rxajzvXiXwN35EQZ";

function removeRepoFromPath($rname,$path){
    $search = "/$rname";
    $searchLength = mb_strlen($search, 'UTF-8');
    echo "Path: ".$path." ".$searchLength."-".$search."<p/>";
    $rpath = $path;
    if (mb_substr($path, 0, $searchLength, 'UTF-8') === $search) {
      $rpath = mb_substr($path, $searchLength, null, 'UTF-8');
      if ($rpath == '') {
        $rpath = '/';
      }
    }
    return $rpath;
}    
// Function to fetch a file from a remote repository
function ftreePutFileFromRepo($mbrMUID, $rname, $fname, $path, $folderID) {
    // Implement the logic to fetch the file from the remote server
    // Example: Use cURL or an API call to retrieve the file
    $remoteUrl = "https://remote-server.com/repo/$rname/$path/$fname";
    $localPath = __DIR__ . "$path/$fname";
    echo "localPath:".$localPath."<br/>";
     
    // Fetch the file
    $rpath = removeRepoFromPath($rname,$path);
    echo "<br/>rpath".$rpath."<br/>";
    $fd  =  ftreeGetFileFromRepo($mbrMUID,$rname,$fname,$rpath,$folderID);
 
    if (!$fd){
       exit ('Node::ftreeGetFileFromRep:Failed');
    }
    $f = $fd->data;

    $f = json_decode($f);
  
    if (!$f->result){
      exit('File:'.$path.'/'.$fname.' Borg Collective - Repository Reports:'.$f->error.'');
    }

    $fcheckSum = $f->file->fileInfo->checkSum;

    $fdata = '';
    
    $x=1;
    //echo "Nshards=".count($f->file->shards);

    forEach($f->file->shards as $rec){
      $j = ptreeRequestShard($mbrMUID,$rec->shardID,$encrypt=0);
      $data = mkyStrReplace('"{','{',$j->data);
      $data = mkyStrReplace('}"','}',$data);
      $jres = json_decode($data);
      $bstr = $jres->data->data;
      $fdata .= base64_decode($bstr);
      $x=$x+1;
    }
    if ($fdata === false) {
        return false; // Failed to fetch the file
    }


    // Save the file locally
    if (!is_dir($localPath)) {
      mkdir(dirname($localPath), 0750, true);
      chown(dirname($localPath), 'www-data');
      chgrp(dirname($localPath), 'www-data');
    } 
    
    if (!file_exists(dirname($localPath))) {
        mkdir(dirname($localPath), 0777, true);
    }
    file_put_contents($localPath, $fdata);
    return true;
}
// Define repository parameters (customize as needed)
$rname    = 'myRepo'; // Repository Name
$folderID = 'folder123'; // Folder ID

$app = $_SERVER['REDIRECT_URL']; // The base URL of the application
$requestUri = removeRepoFromPath($rname,$_SERVER['REQUEST_URI']); // The full request URI

echo "app: ".$app."<br/>";
echo "uri: ".$requestUri."<br/>";
$qry = str_replace($app, '', $requestUri); // Extract the relative path
echo "qry: ".$qry."<br/>";
$fname = basename($app); // Extract the filename
echo "fname: ".$fname."<br/>";

$dirPath = dirname($app); // Extract the directory path

// Local file path
$localPath = __DIR__ . "$rname./$dirPath/$fname";
//exit($localPath);
// If the file doesn't exist locally, fetch it from the remote repository
if (!file_exists($localPath)) {
    if (!ftreePutFileFromRepo($mbrMUID, $rname, $fname, $dirPath, $folderID)) {
        exit("Failed to fetch resource: $fname");
    }
}

// Redirect to the original URL
header("Location: /$rname$requestUri");
exit('');
?>

/* Documentation: 
How It Works
Intercept 404 Requests:

When a requested resource doesn’t exist, the server routes the request to 404.php.
Extract File Information:

Uses $_SERVER['REDIRECT_URL'] to get the base URL of the application.
Uses $_SERVER['REQUEST_URI'] to get the full request URI.
Extracts the relative path ($path), filename ($fname), and directory path ($dirPath) from the URI.
Fetch Missing Resources:

If the file doesn’t exist locally, it fetches it from the remote repository using ftreeGetFileFromRepo.
Redirect to Original URL:

After fetching the file, the script redirects the user back to the original URL using the header("Location: ...") function.
This ensures the code runs in the correct directory context.
Example Scenario
A request is made to https://example.com/scripts/example.php.
If example.php doesn’t exist locally, the server routes the request to 404.php.
404.php extracts the path (/scripts) and filename (example.php).
It fetches example.php from the remote repository and saves it locally.
The script redirects the user back to https://example.com/scripts/example.php.
The server now finds example.php locally and executes it in the correct directory context.
Advantages
Correct Directory Context:

The code runs in the directory where the file is located, ensuring proper behavior (e.g., relative paths work as expected).
Seamless User Experience:

The user is redirected back to the original URL, making the process transparent.
Dynamic Resource Loading:

Automatically fetches missing resources, ensuring the application always has access to the required files.
Decentralized Architecture:

Supports a distributed setup where resources are stored in a central repository and fetched on-demand.
Configuration
Apache:

Ensure the 404.php script is set as the default error handler in your .htaccess file:
ErrorDocument 404 /404.php
Nginx:

Configure the 404.php script as the error page in your server block:
error_page 404 /404.php;
location = /404.php {
    internal;
}
Potential Enhancements
Caching:

Implement a caching mechanism to avoid repeatedly fetching the same files.
Security:

Validate and sanitize input parameters (e.g., $path, $fname) to prevent injection attacks.
Use HTTPS for secure communication with the remote server.
Logging:

Log fetched files for audit or debugging purposes.
Fallback Mechanism:

Serve a default or cached version of the resource if the remote server is unavailable.
This approach is clean and efficient, ensuring the application behaves as expected while dynamically fetching missing resources.

END Documentaion:
*/
