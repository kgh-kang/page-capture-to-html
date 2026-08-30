// 원본과 캡처 결과에서 같은 id 를 가진 요소의 문서 좌표를 비교해, 높이가 어긋나기 시작하는 지점을 찾는다.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9338;
const here = new URL('.', import.meta.url).pathname;
const [url, tag] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), 'vsnap-diff-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1280,800', '--no-first-run',
  '--hide-scrollbars', '--disable-web-security', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pick() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = l.find((x) => x.type === 'page'); if (t) return t; } catch (_) {}
    await sleep(250);
  }
}
const t = await pick();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => pending.set(i, r)); };
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;

const PROBE = `(() => {
  const out = {};
  for (const el of document.querySelectorAll('[id]')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const pos = getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') continue;  // 스크롤 차이로 노이즈
    out[el.id] = [Math.round(r.top + window.scrollY), Math.round(r.height), Math.round(r.left), Math.round(r.width)];
  }
  return out;
})()`;

await send('Page.enable');
await send('Page.navigate', { url });
await sleep(4500);
const a = await evaluate(PROBE);
await send('Page.navigate', { url: 'file://' + resolve(here, '..', 'out', 'test', `${tag}-out.html`) });
await sleep(2500);
const b = await evaluate(PROBE);

const rows = [];
for (const k of Object.keys(a)) {
  if (!(k in b)) continue;
  rows.push({ id: k, origTop: a[k][0], newTop: b[k][0], dTop: b[k][0] - a[k][0], dH: b[k][1] - a[k][1], dW: b[k][3] - a[k][3], origLeft: a[k][2], dLeft: b[k][2] - a[k][2], w: a[k][3] });
}
rows.sort((x, y) => x.origTop - y.origTop);
console.log('공통 id 요소:', rows.length);
console.log('\n문서 흐름 안 요소들의 세로 어긋남 (Δtop 이 달라지는 지점만):');
let prev = null, shown = 0;
for (const r of rows) {
  if (r.dTop === prev) continue;
  prev = r.dTop;
  if (shown++ > 18) break;
  console.log(`  ${String(r.origTop).padStart(6)} → ${String(r.newTop).padStart(6)}  (Δtop ${String(r.dTop).padStart(5)}, Δh ${String(r.dH).padStart(5)}, Δw ${String(r.dW).padStart(5)})  #${r.id}`);
}
console.log('\n가로로 어긋난 요소 (왼쪽 좌표가 처음 틀어지는 순서대로):');
{
  let seen = null, n = 0;
  for (const r of rows) {
    if (Math.abs(r.dLeft) < 3 && Math.abs(r.dW) < 3) continue;
    if (r.dLeft === seen) continue;
    seen = r.dLeft;
    if (n++ > 12) break;
    console.log(`  left ${String(r.origLeft).padStart(5)} → ${String(r.origLeft + r.dLeft).padStart(5)}  (Δleft ${String(r.dLeft).padStart(5)}, Δw ${String(r.dW).padStart(5)}, 원본폭 ${String(r.w).padStart(5)})  #${r.id}`);
  }
}

console.log('\n높이 오차가 큰 요소 상위 10:');
rows.filter((r) => Math.abs(r.dH) > 2).sort((x, y) => Math.abs(y.dH) - Math.abs(x.dH)).slice(0, 10)
  .forEach((r) => console.log(`  Δheight ${String(r.dH).padStart(6)}  (top ${r.origTop})  #${r.id}`));
ws.close(); chrome.kill(); process.exit(0);
