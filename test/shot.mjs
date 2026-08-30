// 원본 페이지와 캡처 결과를 같은 크기로 스크린샷해서 나란히 비교한다.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const here = new URL('.', import.meta.url).pathname;
const profile = mkdtempSync(join(tmpdir(), 'vsnap-shot-'));
const targets = process.argv.slice(2);

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1400,1000', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find((x) => x.type === 'page');
      if (t) return t;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('no target');
}
const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };

await send('Page.enable');
for (const spec of targets) {
  const [file, out, scroll] = spec.split(':');
  await send('Page.navigate', { url: 'file://' + resolve(here, file) });
  await sleep(900);
  if (scroll) await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${scroll})` });
  await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(here, out), Buffer.from(r.result.data, 'base64'));
  console.log('wrote', out);
}
ws.close(); chrome.kill(); process.exit(0);
