#!/usr/bin/env bash
# Print which mailTree cell is currently the PeerTree ROOT.
# The root never receives its own broadcast, so it cannot answer group
# requests (sendMyMail / deleteMyMail) out of its own local DB copy.
for c in mt-m1 mt-m2 mt-m3 mt-m4; do
  rep=$(docker exec "$c" sh -c 'curl -sk "https://127.0.0.1:13394/netREQ/msg=%7B%22req%22%3A%22x%22%2C%22what%22%3A%22getNode%22%7D"' 2>/dev/null)
  echo "$rep" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(process.argv[1],j.ip,"status="+j.status,"root="+j.r.rootNodeIp,"isRoot="+(j.ip===j.r.rootNodeIp));}catch(e){console.log(process.argv[1],"probe failed");}})' "$c"
done
