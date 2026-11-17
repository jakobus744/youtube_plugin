#!/bin/sh
# naechtlicher prueflauf auf dem mini-pc, aufruf per cron (siehe docs/NIGHTLY.md)
# holt den aktuellen stand von github, prueft und meldet probleme per ntfy
set -u
BASE="$HOME/ytx-nightly"
REPO="$BASE/repo"
if [ -f "$BASE/ntfy.env" ]; then
  set -a
  . "$BASE/ntfy.env"
  set +a
fi
cd "$REPO" || exit 1
git pull --ff-only -q || echo "git pull fehlgeschlagen, pruefe den alten stand"
[ -d node_modules/playwright-core ] || npm i --no-save --no-audit --no-fund playwright-core >/dev/null
echo "== $(date -Iseconds)"
node tools/nightly.mjs --state "$BASE/state.json" --out "$BASE/reports"
code=$?
# 0 = alles ok, 3 = probleme schon per ntfy gemeldet, alles andere ist ein abbruch des laufs selbst
if [ "$code" != 0 ] && [ "$code" != 3 ] && [ -n "${NTFY_URL:-}" ]; then
  curl -s -o /dev/null -H "Authorization: Bearer ${NTFY_TOKEN:-}" -H "Title: ytx: naechtlicher Prueflauf abgebrochen" -H "Tags: x"     -d "Exit-Code $code, siehe ~/ytx-nightly/cron.log auf ai-dev" "$NTFY_URL/$NTFY_TOPIC"
fi
