#!/bin/bash
# Bring up (or reset) the mailTree lab.
#   ./run.sh fresh   wipe cell key state + db volumes and rebuild
#   ./run.sh         just start what is defined
set -eu
cd "$(dirname "$0")"

TPL=../../../mySQLTemplates

mkdir -p sql
# every cell db carries the shellFarmer core (whitelist + replay log) and its own
# mailTree schema, built from the repo templates under test
{
  echo "USE shellFarmer;"
  # mySQLTemplates/shellFarmer.sql (pre-existing, from main) leaves the
  # tblWhiteList / tblFarmer CREATE statements unterminated, so terminate any
  # ENGINE=... line that has no ';' before feeding it to the server.
  sed -E 's/^(\) ENGINE=.*[^;])$/\1;/' "$TPL/shellFarmer.sql"
  echo
  cat "$TPL/shellAccounting.sql"
} > sql/00-shellfarmer.sql
for i in $(seq 1 60); do echo "INSERT IGNORE INTO shellFarmer.tblWhiteList (nodeIP) VALUES ('198.51.101.$i');" >> sql/00-shellfarmer.sql; done
echo "INSERT IGNORE INTO shellFarmer.tblWhiteList (nodeIP) VALUES ('127.0.0.1');" >> sql/00-shellfarmer.sql

{
  echo "CREATE DATABASE IF NOT EXISTS mailTree;"
  echo "GRANT ALL PRIVILEGES ON \`mailTree\`.* TO 'shellfarmer'@'%';"
  echo "FLUSH PRIVILEGES;"
  echo "USE mailTree;"
  cat "$TPL/mailTreeTpl.sql"
  echo
  echo "USE mailTree;"
  cat "$TPL/mailTreeSealedMail.sql"
} > sql/01-mailtree.sql

if [ "${1:-}" = "fresh" ]; then
  docker compose down -v --remove-orphans || true
  rm -rf state
  mkdir -p state/m1 state/m2 state/m3 state/m4
  docker compose build
fi

mkdir -p state/m1 state/m2 state/m3 state/m4
docker compose up -d
echo "lab starting; cells: 198.51.101.11 .. .14 (receptor 13395)"
