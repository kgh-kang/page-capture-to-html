#!/usr/bin/env bash
# 웹스토어에 올릴 zip 을 만든다. 확장이 실제로 쓰는 파일만 담는다
# (test/·scripts/·assets/ 는 개발용이라 제외).
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
out="out/pkg/capture-to-html-${version}.zip"

mkdir -p out/pkg
rm -f "$out"
zip -qr "$out" \
  manifest.json background.js content.js popup.html popup.js \
  icons _locales fonts/pretendard-latin.woff2 \
  -x '*.DS_Store'

# 매니페스트가 참조하는 파일이 실제로 담겼는지 확인한다
python3 - "$out" <<'PY'
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
have = set(z.namelist())
m = json.load(open('manifest.json'))
need = ['manifest.json', 'background.js', m['action']['default_popup']]
need += list(m['icons'].values()) + list(m['action']['default_icon'].values())
need += ['_locales/%s/messages.json' % l for l in ('ko', 'en')]
need += ['content.js', 'popup.js', 'fonts/pretendard-latin.woff2']
missing = [n for n in dict.fromkeys(need) if n not in have]
if missing:
    sys.exit('빠진 파일: ' + ', '.join(missing))
print(sys.argv[1], '·', len(have), '개 파일 ·', z.fp.seek(0, 2) // 1024 if False else '', end=' ')
PY
du -h "$out" | cut -f1
