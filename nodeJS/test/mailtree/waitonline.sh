#!/usr/bin/env bash
# Wait until every mailTree cell DB reports the other 3 cells online.
# Usage: ./waitonline.sh [timeoutSeconds]
to=${1:-180}
start=$(date +%s)
while :; do
  ok=1
  line=""
  for i in 1 2 3 4; do
    n=$(docker exec mt-db$i mariadb -ushellfarmer -pshellfarmer -N -B -e \
      "select count(*) from mailTree.mailCells where mcelLastStatus='online';" 2>/dev/null | tail -1 | tr -d '\r')
    [ -z "$n" ] && n=x
    line="$line m$i:$n"
    case "$n" in 3|4) ;; *) ok=0 ;; esac
  done
  echo "online$line"
  [ $ok = 1 ] && exit 0
  [ $(( $(date +%s) - start )) -gt $to ] && { echo "TIMEOUT waiting for cells online"; exit 1; }
  sleep 5
done
