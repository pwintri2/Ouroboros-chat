#!/usr/bin/env bash
set -u

HOST="${OUROBOROS_CHAT_VITE_HOST:-127.0.0.1}"
PORT="${OUROBOROS_CHAT_VITE_PORT:-1421}"
URL="http://${HOST}:${PORT}/"

vite_is_serving() {
  python3 - "$URL" <<'PY'
import sys
import urllib.request

url = sys.argv[1]
try:
    with urllib.request.urlopen(url, timeout=1.5) as response:
        body = response.read(4096).decode("utf-8", "replace")
except Exception:
    raise SystemExit(1)

if response.status < 500 and ("/@vite/client" in body or "/src/main.tsx" in body):
    raise SystemExit(0)
raise SystemExit(1)
PY
}

if vite_is_serving; then
  echo "Vite dev server already serving ${URL}; reusing it."
  exit 0
fi

exec vite --host "$HOST" --port "$PORT"
