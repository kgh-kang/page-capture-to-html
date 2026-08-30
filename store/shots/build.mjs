// 스토어 제출용 이미지(스크린샷 1280x800, 프로모 타일 440x280)를 만든다.
// 캡처 결과 PNG 를 data URI 로 심고 헤드리스 크롬에서 렌더한다.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9361;
const here = new URL('.', import.meta.url).pathname;
const ROOT = resolve(here, '..', '..');
const OUT = resolve(ROOT, 'dist', 'store');
mkdirSync(OUT, { recursive: true });

// 소재 PNG 는 test/ 가 만들어내는 것이라 저장소에 없다. 없으면 여기서 만든다.
const NEED = [
  ['test/wiki-original.png', ['test/live.mjs', 'https://ko.wikipedia.org/wiki/HTML', 'wiki', '600']],
  ['test/fin-original.png', ['test/live.mjs', 'https://finance.naver.com/', 'fin', '0']],
  ['test/finx-capture.png', ['test/live.mjs', 'https://finance.naver.com/', 'finx', '0', 'overlay']],
  ['test/hn-capture.png', ['test/live.mjs', 'https://news.ycombinator.com', 'hn', '0']],
  ['test/ui-ko-light-idle.png', ['test/uishot.mjs', 'ko,en']],
];
for (const [file, cmd] of NEED) {
  if (existsSync(resolve(ROOT, file))) continue;
  process.stdout.write(`  소재 생성: ${file} … `);
  const r = spawnSync('node', cmd, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.log('실패'); console.error(r.stderr); process.exit(1); }
  console.log('완료');
}

const img = (p) => 'data:image/png;base64,' + readFileSync(resolve(ROOT, p)).toString('base64');
const font = readFileSync(resolve(ROOT, 'fonts/pretendard-latin.woff2')).toString('base64');

const LANG = (process.argv[2] || 'ko');
const T = LANG === 'en' ? {
  s1: ['The screen you saw, saved', 'Open the file and it is exactly what you were looking at'],
  s2: ['Clear what covers the page', 'The dialog is taken away and what was underneath is saved'],
  s3: ['Text stays text', 'Select it, copy it, search it — a screenshot cannot do that'],
  s4: ['Pick one, then save', 'Everything else stays out of your way'],
  s5: ['One file, nothing else', 'Images and web fonts are inside, so it opens without internet'],
  before: 'Original page', after: 'Saved file', tile: 'Saves only what you see',
  c1: ['0.31 MB', 'one HTML file', 'no scripts'],
  c2: ['dialog removed', 'the chart underneath is kept'],
  c3: ['tables keep their columns', 'links stay clickable'],
  c5: ['images embedded', 'web fonts embedded', 'works offline'],
} : {
  s1: ['보던 화면을 그대로', '파일을 열면 캡처한 그 순간이 그대로 나옵니다'],
  s2: ['가린 창은 걷어내고', '화면을 덮은 안내창을 치우고 그 아래를 저장합니다'],
  s3: ['글자는 글자로 남습니다', '그대로 선택하고 복사하고 검색합니다. 스크린샷은 못 하는 일입니다'],
  s4: ['하나 고르고 저장', '나머지는 알아서 합니다'],
  s5: ['파일 하나면 끝', '이미지도 글꼴도 안에 들어 있어 인터넷 없이 열립니다'],
  before: '원래 페이지', after: '저장한 파일', tile: '보이는 것만 저장합니다',
  c1: ['0.31 MB', 'HTML 파일 하나', '스크립트 없음'],
  c2: ['안내창 제거', '아래 차트까지 그대로'],
  c3: ['표는 열이 유지되고', '링크도 눌립니다'],
  c5: ['이미지 포함', '웹폰트 포함', '인터넷 없이 열림'],
};

const CSS = `
  @font-face{font-family:P;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1280px;height:800px;overflow:hidden;
    font-family:P,-apple-system,"Apple SD Gothic Neo",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;background:#fff;color:#16181d}
  .shot{width:1280px;height:800px;display:flex;flex-direction:column;
    background:linear-gradient(170deg,#fff7f2 0%,#ffe9dc 100%)}
  .head{padding:44px 68px 0;flex:none}
  h1{font-size:46px;line-height:1.12;letter-spacing:-.032em;font-weight:800}
  p.sub{margin-top:12px;font-size:19.5px;color:#7a655b;letter-spacing:-.01em}
  .stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
    gap:20px;padding:22px 68px 16px}
  .chips{flex:none;display:flex;gap:9px;justify-content:center;padding:0 64px 40px}
  .chips span{background:#fff;color:#a34a12;font-size:14.5px;font-weight:600;
    padding:8px 16px;border-radius:999px;box-shadow:0 2px 8px rgba(120,60,20,.10)}
  .win{border-radius:12px;overflow:hidden;background:#fff;
    box-shadow:0 18px 44px rgba(120,60,20,.16),0 2px 6px rgba(120,60,20,.10)}
  .bar{height:30px;background:#f1f0ee;display:flex;align-items:center;gap:6px;padding:0 12px;flex:none}
  .dot{width:9px;height:9px;border-radius:50%}
  .win img{display:block}
  .cap{margin-top:11px;font-size:14px;color:#8a7268;text-align:center;font-weight:500}
  .pair{display:flex;flex-direction:column;align-items:center}
  .arrow{font-size:30px;color:#c2410c;flex:none;align-self:center;margin-top:-26px}
  .popup{border-radius:14px;overflow:hidden;box-shadow:0 18px 44px rgba(120,60,20,.18)}
  .tile{width:440px;height:280px;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:18px;background:linear-gradient(160deg,#ff9f0a 0%,#e85a0a 100%)}
  .tile img{width:96px;height:96px;border-radius:22px;box-shadow:0 8px 20px rgba(0,0,0,.18)}
  .tile b{font-size:31px;color:#fff;letter-spacing:-.02em;font-weight:800}
  .tile span{font-size:15px;color:rgba(255,255,255,.92)}
`;

function chips(items) {
  return `<div class="chips">${items.map((c) => `<span>${c}</span>`).join('')}</div>`;
}

// 캡처 원본은 가로로 길어(1280x657) 나란히 놓으면 세로가 비는다.
// 높이를 주면 상단부를 채워 잘라 보여준다 — 창 안을 들여다보는 느낌이 난다.
function win(src, w, caption, h) {
  const style = h
    ? `width:${w}px;height:${h}px;object-fit:cover;object-position:top left`
    : `width:${w}px`;
  return `<div class="pair"><div class="win" style="width:${w}px">
    <div class="bar"><span class="dot" style="background:#ff5f57"></span>
    <span class="dot" style="background:#febc2e"></span>
    <span class="dot" style="background:#28c840"></span></div>
    <img src="${src}" style="${style}"></div>
    ${caption ? `<div class="cap">${caption}</div>` : ''}</div>`;
}

const PAGES = {
  // 1. 핵심 가치 — 저장된 결과를 크게 하나만 보여준다
  '01-saved': `<div class="shot"><div class="head"><h1>${T.s1[0]}</h1><p class="sub">${T.s1[1]}</p></div>
    <div class="stage">${win(img('test/wiki-capture.png'), 1144, '', 452)}</div>
    ${chips(T.c1)}</div>`,

  // 2. 유일하게 before/after 가 의미 있는 장면 — 차이가 확연하다
  '02-overlay': `<div class="shot"><div class="head"><h1>${T.s2[0]}</h1><p class="sub">${T.s2[1]}</p></div>
    <div class="stage">${win(img('test/fin-original.png'), 552, T.before, 396)}
    <div class="arrow">→</div>${win(img('test/finx-capture.png'), 552, T.after, 396)}</div>
    ${chips(T.c2)}</div>`,

  // 3. 스크린샷과의 차이 — 복잡한 표가 열까지 그대로 살아 있다
  '03-text': `<div class="shot"><div class="head"><h1>${T.s3[0]}</h1><p class="sub">${T.s3[1]}</p></div>
    <div class="stage">${win(img('test/hn-capture.png'), 1144, '', 452)}</div>
    ${chips(T.c3)}</div>`,

  // 4. 사용법
  '04-popup': `<div class="shot"><div class="head"><h1>${T.s4[0]}</h1><p class="sub">${T.s4[1]}</p></div>
    <div class="stage" style="gap:52px;align-items:flex-start;padding-top:14px">
      <img class="popup" src="${img('test/ui-' + LANG + '-light-idle.png')}" style="width:346px">
      <img class="popup" src="${img('test/ui-' + LANG + '-light-done.png')}" style="width:346px">
    </div></div>`,

  // 5. 단일 파일
  '05-single': `<div class="shot"><div class="head"><h1>${T.s5[0]}</h1><p class="sub">${T.s5[1]}</p></div>
    <div class="stage">${win(img('test/finx-capture.png'), 1144, '', 452)}</div>
    ${chips(T.c5)}</div>`,

  'tile': `<div class="tile"><img src="${img('icons/icon128.png')}">
    <b>Capture to HTML</b><span>${T.tile}</span></div>`,
};

const profile = mkdtempSync(join(tmpdir(), 'cth-shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 80; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = l.find((x) => x.type === 'page'); if (target) break; } catch (_) {}
  await sleep(250);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => pending.set(i, r)); };
await send('Page.enable');

for (const [name, body] of Object.entries(PAGES)) {
  const tile = name === 'tile';
  const [w, h] = tile ? [440, 280] : [1280, 800];
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}
    body{width:${w}px;height:${h}px}</style>${body}`;
  await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
  await sleep(700);
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  const file = resolve(OUT, `${LANG}-${name}.png`);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log(`  ${LANG}-${name}.png  ${w}x${h}`);
}
ws.close(); chrome.kill(); process.exit(0);
