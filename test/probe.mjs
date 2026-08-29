// 임의의 JS 표현식을 실제 페이지에서 평가해 보는 진단 도구.
//   node test/probe.mjs <URL> '<표현식>'
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9341;
const profile = mkdtempSync(join(tmpdir(), 'vsnap-probe-'));
const [url, expr] = process.argv.slice(2);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,800', '--no-first-run', '--hide-scrollbars', '--disable-web-security', url], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t;
for (let i = 0; i < 80; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    t = l.find((x) => x.type === 'page' && !x.url.startsWith('about')); if (t) break; } catch (_) {}
  await sleep(250);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => pending.set(i, r)); };
await sleep(5000);
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
const res = r.result;
console.log(res.exceptionDetails ? JSON.stringify(res.exceptionDetails.exception) : res.result.value);
ws.close(); chrome.kill(); process.exit(0);
