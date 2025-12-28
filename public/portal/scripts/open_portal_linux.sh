#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
xdg-open "$DIR/../index.html" >/dev/null 2>&1 || true
echo "Opened portal in default browser."
