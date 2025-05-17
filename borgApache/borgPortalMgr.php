<?php
class BorgPortal {
    private $pfile;
    private $portals;

    public function __construct() {
        $this->pfile = '/peerTree/keys/borgPortalsList.dat';
        $this->portals = [];
        $this->loadPortals();
    }

    private function loadPortals() {
        if (file_exists($this->pfile)) {
            $data = file_get_contents($this->pfile);
            $this->portals = json_decode($data, true);
        } else {
            $this->portals = [];
        }
    }

    private function testConnect($url) {
      $ch = curl_init($url);
      curl_setopt ($ch, CURLOPT_NOBODY, true);
      curl_setopt ($ch, CURLOPT_RETURNTRANSFER, true);
      curl_setopt ($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
      curl_setopt ($ch, CURLOPT_SSL_VERIFYPEER, false);
      curl_setopt ($ch, CURLOPT_SSL_VERIFYHOST, false);

      curl_setopt ($ch, CURLOPT_CONNECTTIMEOUT, 1); // Max time to establish connection (seconds)
      curl_setopt ($ch, CURLOPT_TIMEOUT, 3); // Max time for the request to execute (seconds)

      curl_exec($ch);
      $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
      curl_close($ch);

      return $httpCode == 200;
    }
    public function selectPortal($netName) {
        $index = array_search($netName, array_column($this->portals, 'netName'));

        if ($index === false) {
            return 'web.bitmonky.com';
        }

        $activeNodes = $this->portals[$index]['activeNodes'];
        $n = 0;
        while (!empty($activeNodes) && $n < 5) {
            $rnodeIndex = array_rand($activeNodes);
            $result = $activeNodes[$rnodeIndex];
            $result = $result['ip'];
            if (isset($this->portals[$index]['recpPort'])) {
                $result .= ':' . $this->portals[$index]['recpPort'];
            }
            if ($this->testConnect('https://'.$result.'/')) {
                return $result;
            }

            unset($activeNodes[$rnodeIndex]);
            $n = $n + 1;
        }
        return 'web.bitmonky.com';
    }
}
?>
