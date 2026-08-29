#!/usr/bin/env bash
# 웹스토어에 올릴 zip 을 만든다. 확장이 실제로 쓰는 파일만 담는다
# (test/·scripts/·assets/ 는 개발용이라 제외).
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
name=$(python3 -c "import json;print(json.load(open('manifest.json'))['name'].lower().replace(' ','-'))")
out="dist/${name}-${version}.zip"

mkdir -p dist
rm -f "$out"
zip -qr "$out" \
  manifest.json background.js content.js popup.html popup.js icons fonts \
  -x '*.DS_Store'

echo "$out"
unzip -l "$out" | tail -1
