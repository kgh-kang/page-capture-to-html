// template.src.html 에 무거운 자산을 심어 template.html 을 만든다.
//   node store/shots/build-template.mjs
//
// 완성본은 3MB 가 넘어 저장소에 두지 않는다(.gitignore). 소스는 27KB 뿐이고
// 나머지는 전부 여기서 만들어 붙인다 — 글꼴, 팝업 UI, 창 안 화면.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const ROOT = resolve(here, '..', '..');
const SRC = resolve(here, 'template.src.html');
const OUT = resolve(here, 'template.html');

const b64 = (p) => readFileSync(p).toString('base64');
const run = (what, args) => {
  process.stdout.write(`  ${what} … `);
  const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.log('실패'); console.error(r.stderr || r.stdout); process.exit(1); }
  console.log('완료');
};

// 팝업 UI 는 popup.html 을 실제로 렌더해 찍은 것이라 언제든 다시 만들 수 있다
const POPUP_FILES = ['ko', 'en'].flatMap((l) => ['idle', 'done'].map((s) => `test/ui-${l}-light-${s}.png`));
if (POPUP_FILES.some((f) => !existsSync(resolve(ROOT, f)))) run('팝업 UI 캡처', ['test/uishot.mjs', 'ko,en']);

// 창 안에 들어갈 사이트 화면. 없으면 기본값(위키백과)으로 받아온다
const SCREEN_FILES = ['ko', 'en'].map((l) => `store/shots/screens/${l}.png`);
if (SCREEN_FILES.some((f) => !existsSync(resolve(ROOT, f)))) run('사이트 화면 캡처', ['store/shots/embed-shots.mjs']);

const popup = Object.fromEntries(['ko', 'en'].map((l) => [l, Object.fromEntries(
  ['idle', 'done'].map((s) => [s, `data:image/png;base64,${b64(resolve(ROOT, `test/ui-${l}-light-${s}.png`))}`]))]));
const shot = Object.fromEntries(['ko', 'en'].map((l) =>
  [l, `data:image/png;base64,${b64(resolve(ROOT, `store/shots/screens/${l}.png`))}`]));

const html = readFileSync(SRC, 'utf8')
  .replace('@FONT@', `data:font/woff2;base64,${b64(resolve(ROOT, 'fonts/pretendard-kr.woff2'))}`)
  .replace('@POPUP@', JSON.stringify(popup))
  .replace('@SHOT@', JSON.stringify(shot));

writeFileSync(OUT, html);
console.log(`template.html ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB — 크롬에서 열면 된다`);
