#!/bin/sh
cd "$(dirname "$0")"
echo "KaPya ERP : ouvrez http://localhost:8100 (Ctrl+C pour arreter)"
python3 -m http.server 8100
