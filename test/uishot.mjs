// 팝업 UI 를 실제 크기로, 라이트/다크 두 가지로 찍는다.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9343;
const here = new URL('.', import.meta.url).pathname;
const profile = mkdtempSync(join(tmpdir(), 'vsnap-ui-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=400,900', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
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
const popup = 'file://' + resolve(here, '..', 'popup.html');

for (const [scheme, tag] of [['light', 'light'], ['dark', 'dark']]) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  for (const [hash, state] of [['', 'idle'], ['#notice', 'notice'], ['#done', 'done'], ['#done', 'open']]) {
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(120);
    await send('Page.navigate', { url: popup + hash });
    await sleep(700);
    if (state === 'open') { await evaluate('document.getElementById("adv").open = true'); await sleep(250); }
    const box = await evaluate('JSON.stringify({w: document.body.scrollWidth, h: document.body.scrollHeight})');
    const { w, h } = JSON.parse(box);
    const r = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: w, height: h, scale: 2 },
    });
    const name = `ui-${tag}-${state}.png`;
    writeFileSync(resolve(here, name), Buffer.from(r.result.data, 'base64'));
    console.log(`${name}  ${w}x${h}`);
  }
}
ws.close(); chrome.kill(); process.exit(0);
