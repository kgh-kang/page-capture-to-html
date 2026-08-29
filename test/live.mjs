// 실제 사이트에서 캡처해 보고, 원본/결과 스크린샷을 나란히 남긴다.
// 확장 없이 돌리므로 리소스 fetch 는 페이지 컨텍스트의 fetch 로 대신한다(교차 출처 일부는 실패).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9336;
const here = new URL('.', import.meta.url).pathname;
const url = process.argv[2];
const tagName = process.argv[3] || 'live';
const scrollY = Number(process.argv[4] || 0);
const contentJs = readFileSync(resolve(here, '..', 'content.js'), 'utf8');
const profile = mkdtempSync(join(tmpdir(), 'vsnap-live-'));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,800', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--disable-web-security', url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pick() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find((x) => x.type === 'page' && !x.url.startsWith('about:'));
      if (t) return t;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('no target');
}
const t = await pick();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };
async function evaluate(expression, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  const res = r.result;
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails.exception || res.exceptionDetails));
  return res.result.value;
}

await send('Page.enable');
await sleep(4000);
if (scrollY) { await evaluate(`window.scrollTo(0, ${scrollY})`, false); await sleep(1200); }

const before = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve(here, `${tagName}-original.png`), Buffer.from(before.result.data, 'base64'));

await evaluate(`
  window.__blobText = null;
  URL.createObjectURL = (b) => { window.__blobPromise = b.text().then(t => window.__blobText = t); return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  const toDataUrl = async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    if (!r.ok) throw new Error('x');
    const b = await r.blob();
    return await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); });
  };
  window.chrome = { runtime: {
    onMessage: { addListener: (f) => { window.__listener = f; } },
    sendMessage: (m, cb) => {
      if (m.type === 'VSNAP_FETCH') toDataUrl(m.url).then(d => cb({ dataUrl: d }), () => cb(null));
      else if (m.type === 'VSNAP_FETCH_TEXT') fetch(m.url).then(r => r.text()).then(t => cb({ text: t }), () => cb(null));
      else cb(null);
    },
    lastError: undefined,
  }};
  'ok'
`, false);
await evaluate(contentJs + '\n;"injected"', false);

const opts = { crop: true, occlusion: true, pin: true, images: true, fonts: true, frames: true, restoreScroll: true,
  dropOverlay: (process.argv[5] || '').includes('overlay'),
  freeze: (process.argv[5] || '').includes('freeze') };
const t0 = Date.now();
const result = await evaluate(`new Promise(res => window.__listener({type:'VSNAP_CAPTURE', opts: ${JSON.stringify(opts)}}, null, res))`);
console.log(tagName, JSON.stringify(result));
await evaluate('window.__blobPromise');
const html = await evaluate('window.__blobText');
const outFile = resolve(here, `${tagName}-out.html`);
writeFileSync(outFile, html || '');
console.log('  wall', Date.now() - t0, 'ms ·', (html.length / 1024 / 1024).toFixed(2), 'MB');

await send('Page.navigate', { url: 'file://' + outFile });
await sleep(2500);
const after = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve(here, `${tagName}-capture.png`), Buffer.from(after.result.data, 'base64'));
ws.close(); chrome.kill(); process.exit(0);
