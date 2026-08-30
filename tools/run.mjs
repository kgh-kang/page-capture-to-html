// 의존성 없는 CDP 스모크 테스트. Node 22+ 내장 WebSocket 사용.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const here = new URL('.', import.meta.url).pathname;
const pageUrl = 'file://' + resolve(here, 'page.html');
const contentJs = readFileSync(resolve(here, '..', 'src', 'content.js'), 'utf8');
const OUT = resolve(here, '..', 'out', 'test');
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vsnap-'));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1000,700', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--hide-scrollbars', pageUrl,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find((x) => x.type === 'page' && x.url.startsWith('file:'));
      if (t) return t;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('Chrome 에 붙지 못했습니다');
}

const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}) {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
}
async function evaluate(expression, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.error) throw new Error(JSON.stringify(r.error));
  const res = r.result;
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails.exception || res.exceptionDetails));
  return res.result.value;
}

await send('Runtime.enable');
await sleep(400);

// chrome.* 및 다운로드 경로 shim
await evaluate(`
  window.__blobText = null;
  const _create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { window.__blobPromise = b.text().then(t => window.__blobText = t); return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  window.chrome = {
    runtime: {
      onMessage: { addListener: (f) => { window.__listener = f; } },
      sendMessage: (m, cb) => { setTimeout(() => cb && cb(null), 0); },  // 리소스는 전부 실패시켜 본다
      lastError: undefined,
    },
  };
  'shimmed'
`, false);

await evaluate(contentJs + '\n;"injected"', false);

const opts = { crop: true, occlusion: true, pin: true, images: true, fonts: true, frames: true, restoreScroll: true };
const result = await evaluate(`
  new Promise((res) => window.__listener({ type: 'VSNAP_CAPTURE', opts: ${JSON.stringify(opts)} }, null, res))
`);
console.log('capture result:', JSON.stringify(result, null, 2));


await evaluate('window.__blobPromise');
const html = await evaluate('window.__blobText');
writeFileSync(resolve(OUT, 'out.html'), html || '');

// '페이지 전체' 로도 한 번 캡처해 화면 밖 내용이 담기는지 본다
await evaluate('window.__blobText = null; window.__blobPromise = null;', false);
await evaluate(`
  new Promise((res) => window.__listener({ type: 'VSNAP_CAPTURE',
    opts: ${JSON.stringify({ ...opts, crop: false })} }, null, res))
`);
await evaluate('window.__blobPromise');
const whole = await evaluate('window.__blobText');
writeFileSync(resolve(OUT, 'out-whole.html'), whole || '');

// 같은 페이지를 '읽기 전용으로 굳히기' 로 한 번 더 캡처해 비교한다
await evaluate('window.__blobText = null; window.__blobPromise = null;', false);
await evaluate(`
  new Promise((res) => window.__listener({ type: 'VSNAP_CAPTURE',
    opts: ${JSON.stringify({ ...opts, freeze: true })} }, null, res))
`);
await evaluate('window.__blobPromise');
const frozen = await evaluate('window.__blobText');
writeFileSync(resolve(OUT, 'out-frozen.html'), frozen || '');

// ---- 검증 ----
const checks = [
  ['보이는 텍스트 유지',            () => html.includes('보이는 최상단 텍스트')],
  ['display:none 내용 제거',        () => !html.includes('display none — 완전히 사라져야 함')],
  ['visibility:hidden 내용 제거',   () => !html.includes('visibility hidden')],
  ['opacity:0 내용 제거',           () => !html.includes('opacity 0 —')],
  ['투명 부모의 자식 제거',          () => !html.includes('투명 부모의 자식')],
  ['뷰포트 밖 내용 제거',            () => !html.includes('한참 아래 —')],
  ['가려진 요소 제거',              () => !html.includes('가려진 요소')],
  ['가상요소 규칙 보존',            () => /::before\{[^}]*content:"★ "/.test(html) || html.includes('★')],
  ['애니메이션 속성 제거',           () => !/animation-name/.test(html)],
  ['원본 <style>/keyframes 미포함',  () => !html.includes('@keyframes')],
  ['input 값 보존',                 () => html.includes('사용자가 타이핑한 값')],
  ['내부 스크롤 값 기록',            () => html.includes('data-vsc="0,80"')],
  ['스크롤 컨테이너 안 보이는 행 제거', () => !html.includes('1행')],
  ['스크롤 컨테이너 안 보이는 행 유지', () => html.includes('3행 — 스크롤해서 보이는 행')],
  ['script 태그 제거(복원용 1개 제외)', () => (html.match(/<script/g) || []).length === 1],
  ['크기값 서브픽셀 정리',            () => !/(width|height):\d+\.\d{3,}px/.test(html)],
  ['굳히기: 링크 href 제거',        () => !/<a[^>]+href=/i.test(frozen)],
  ['굳히기: 스크립트 0개',          () => !/<script/i.test(frozen)],
  ['굳히기: 입력칸 readonly',       () => /<input[^>]+readonly/i.test(frozen)],
  ['굳히기: 스크립트 없이 크롭',     () => /html\{overflow:hidden!important/.test(frozen)],
  ['굳히기: 보이는 텍스트는 유지',   () => frozen.includes('보이는 최상단 텍스트')],
  ['일반 저장은 링크 유지',          () => /<a[^>]+href=/i.test(html)],
  ['pointer-events:none 텍스트 유지', () => html.includes('클릭 안 받는 라벨 텍스트')],
  ['클립 밖 절대배치 글 제거',        () => !html.includes('클립 밖으로 나가 잘린 글')],
  ['static 조상은 절대배치를 안 자름', () => html.includes('클립 조상이 static 이라 안 잘리는 글')],
  ['페이지 전체: 화면 밖 내용 포함',  () => whole.includes('한참 아래 —')],
  ['페이지 전체: 숨긴 것은 여전히 제외', () => !whole.includes('display none — 완전히 사라져야 함')],
  ['지금 화면만: 화면 밖 내용 제외',   () => !html.includes('한참 아래 —')],
  ['크롭 잠금 삽입',                () => html.includes('setProperty("overflow","hidden","important")')],
  ['스크롤 정렬 앵커 기록',          () => html.includes('data-vsa=')],
];
let fail = 0;
for (const [name, fn] of checks) {
  let ok = false, err = '';
  try { ok = !!fn(); } catch (e) { err = String(e); }
  if (!ok) fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (err ? ' — ' + err : ''));
}
console.log(`\n${checks.length - fail}/${checks.length} 통과 · out.html ${(html.length / 1024).toFixed(1)} KB`);

ws.close();
chrome.kill();
process.exit(fail ? 1 : 0);
