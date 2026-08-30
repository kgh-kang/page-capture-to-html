// Pretendard 로 텍스트를 렌더해 투명 PNG 마스크로 뽑는다.
// 아이콘 글자를 획으로 흉내내는 대신 진짜 폰트 모양을 쓰기 위한 것.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9347;
const here = new URL('.', import.meta.url).pathname;
// 원본 폰트(791KB)는 저장소에 넣지 않는다. 없으면 받아온다.
const fontPath = resolve(here, '..', 'out', 'masks', 'Pretendard-Bold.woff2');
if (!existsSync(fontPath)) {
  mkdirSync(resolve(here, '..', 'out', 'masks'), { recursive: true });
  const url = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2';
  process.stdout.write('Pretendard Bold 내려받는 중… ');
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  if (buf.subarray(0, 4).toString() !== 'wOF2') throw new Error('폰트를 받지 못했습니다: ' + url);
  writeFileSync(fontPath, buf);
  console.log((buf.length / 1024 | 0) + 'KB');
}
const font = readFileSync(fontPath).toString('base64');
const profile = mkdtempSync(join(tmpdir(), 'vsnap-font-'));

const JOBS = [
  { text: 'HTML', size: 200, tracking: '-0.02em', out: 'mask-html.png' },
  { text: 'H',    size: 200, tracking: '0',       out: 'mask-h.png' },
];

const page = (t) => `data:text/html;charset=utf-8,` + encodeURIComponent(`
<meta charset="utf-8">
<style>
  @font-face{font-family:P;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700}
  html,body{margin:0;background:transparent}
  #t{display:inline-block;font:700 ${t.size}px/1 P;letter-spacing:${t.tracking};color:#fff;
     white-space:pre;padding:0}
</style><span id="t">${t.text}</span>`);

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--window-size=1200,600', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t;
for (let i = 0; i < 80; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    t = l.find((x) => x.type === 'page'); if (t) break; } catch (_) {}
  await sleep(250);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => pending.set(i, r)); };
const evaluate = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.result.value;

await send('Page.enable');
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

for (const job of JOBS) {
  await send('Page.navigate', { url: page(job) });
  await sleep(600);
  await evaluate('document.fonts.ready.then(()=>1)');
  await sleep(200);
  const box = JSON.parse(await evaluate(
    'JSON.stringify((()=>{const r=document.getElementById("t").getBoundingClientRect();' +
    'return{x:r.x,y:r.y,w:r.width,h:r.height}})())'));
  const r = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: box.x, y: box.y, width: Math.ceil(box.w), height: Math.ceil(box.h), scale: 1 },
    captureBeyondViewport: true,
  });
  writeFileSync(resolve(here, '..', 'out', 'masks', job.out), Buffer.from(r.result.data, 'base64'));
  console.log(job.out, Math.round(box.w) + 'x' + Math.round(box.h));
}
ws.close(); chrome.kill(); process.exit(0);
