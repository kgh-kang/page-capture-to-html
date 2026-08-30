// 템플릿 창 안에 들어갈 사이트 화면을 찍어 template.html 에 심는다.
//   node store/shots/embed-shots.mjs
// iframe 으로 띄우면 편하지만 그 상태로는 PNG 저장이 안 된다 — 다른 출처의 iframe 은
// canvas 로 옮길 수 없기 때문이다. 그래서 화면을 미리 그림으로 박아 둔다.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9366;
const here = new URL('.', import.meta.url).pathname;
const TPL = resolve(here, 'template.html');

// 템플릿의 .viewport 크기 그대로 찍어 1:1 로 들어가게 한다(확대/축소 없음 = 또렷함)
const W = 1104, H = 482;
const PAGES = {
  ko: 'https://ko.wikipedia.org/wiki/HTML',
  en: 'https://en.wikipedia.org/wiki/HTML',
};
// 공지·정리 알림 상자는 스크린샷에 들어가면 지저분하다
const CLEAN = `
  document.querySelectorAll(
    '#siteNotice, .mw-dismissable-notice, .cdx-message, .ambox, .mw-message-box, .vector-sitenotice-container'
  ).forEach((n) => n.remove());
  document.documentElement.scrollTop = 0;
`;

const profile = mkdtempSync(join(tmpdir(), 'shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--no-first-run',
  '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 80; i++) {
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === 'page');
    if (target) break;
  } catch (_) {}
  await sleep(250);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => pending.set(i, r)); };

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const shots = {};
for (const [lang, url] of Object.entries(PAGES)) {
  await send('Page.navigate', { url });
  await sleep(3500);
  await send('Runtime.evaluate', { expression: CLEAN });
  await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  shots[lang] = r.result.data;
  console.log(`  ${lang}  ${Math.round(r.result.data.length / 1365)}KB  ${url}`);
}
ws.close(); chrome.kill();

let tpl = readFileSync(TPL, 'utf8');
const block = 'const SHOT = {\n'
  + Object.entries(shots).map(([k, v]) => `  ${k}: 'data:image/png;base64,${v}',`).join('\n')
  + '\n};';
tpl = /const SHOT = \{[\s\S]*?\n\};/.test(tpl)
  ? tpl.replace(/const SHOT = \{[\s\S]*?\n\};/, block)
  : tpl.replace('const ICON =', block + '\n\nconst ICON =');
writeFileSync(TPL, tpl);
console.log(`template.html 갱신 · ${(Buffer.byteLength(tpl) / 1024 / 1024).toFixed(2)} MB`);
process.exit(0);
