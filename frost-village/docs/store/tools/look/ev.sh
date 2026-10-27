#!/bin/bash
# ev.sh <port> <jsfile|-> [arg-json]   run a JS function source in the driver page
P=$1; F=$2; A=$3
if [ "$F" = "-" ]; then curl -s -X POST --data-binary @- "http://127.0.0.1:$P/eval?arg=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "${A:-}")"; else curl -s -X POST --data-binary @"$F" "http://127.0.0.1:$P/eval?arg=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "${A:-}")"; fi
echo
