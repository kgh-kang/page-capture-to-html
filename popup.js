const DEFAULTS = {
  crop: true, occlusion: true, pin: true,
  images: true, fonts: true, frames: true, restoreScroll: true,
  dropOverlay: false, freeze: false,
};
const TOGGLES = ['freeze', 'dropOverlay', 'occlusion', 'images', 'fonts', 'frames', 'restoreScroll', 'pin'];

const $ = (id) => document.getElementById(id);
const go = $('go');
const result = $('result');
let opts = { ...DEFAULTS };
let tab = null;

/* ---------- 옵션 상태 ---------- */

function paintMode() {
  $('c-crop').classList.toggle('on', opts.crop);
  $('c-full').classList.toggle('on', !opts.crop);
  $('c-crop').querySelector('input').checked = opts.crop;
  $('c-full').querySelector('input').checked = !opts.crop;
}

function save() {
  try { chrome.storage.local.set({ opts }); } catch (_) {}
}

function wire() {
  for (const el of document.querySelectorAll('input[name=mode]')) {
    el.addEventListener('change', () => { opts.crop = el.value === 'crop'; paintMode(); save(); });
  }
  for (const k of TOGGLES) {
    const el = $(k);
    el.addEventListener('change', () => { opts[k] = el.checked; paintOptions(); save(); });
  }
  // 배너의 스위치는 '덮은 안내창 치우기' 와 같은 값을 가리킨다
  $('dropOverlay2').addEventListener('change', (e) => {
    opts.dropOverlay = e.target.checked; paintOptions(); save();
  });
}

function paintOptions() {
  paintMode();
  for (const k of TOGGLES) $(k).checked = !!opts[k];
  $('dropOverlay2').checked = !!opts.dropOverlay;
  // 굳히면 자동 실행 코드가 아예 안 들어가므로 '열 때 보던 위치로' 는 의미가 없어진다.
  const scroll = $('restoreScroll');
  scroll.disabled = !!opts.freeze;
  scroll.closest('.opt').classList.toggle('muted', !!opts.freeze);
}

/* ---------- 현재 페이지 정보 ---------- */

const CAPTURABLE = /^(https?|file):/;

async function loadTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = t;
  if (!t) return fail('열려 있는 탭을 찾지 못했어요.');

  $('pageTitle').textContent = t.title || t.url || '';
  if (!CAPTURABLE.test(t.url || '')) {
    $('pageMeta').textContent = '이 페이지는 저장할 수 없어요 (브라우저 내부 화면)';
    go.disabled = true;
    return;
  }

  try {
    const [{ result: v }] = await chrome.scripting.executeScript({
      target: { tabId: t.id },
      func: () => ({ w: innerWidth, h: innerHeight, y: Math.round(scrollY), max: document.documentElement.scrollHeight }),
    });
    const scrolled = v.y > 0 ? ` · 아래로 ${v.y.toLocaleString()}px 내린 위치` : ' · 맨 위';
    $('pageMeta').textContent = `${v.w} × ${v.h}${scrolled}`;
  } catch (_) {
    $('pageMeta').textContent = '페이지를 새로고침한 뒤 다시 열어 주세요';
  }
}

function detectOverlay() {
  const vw = innerWidth, vh = innerHeight, vpArea = Math.max(1, vw * vh);
  const alphaOf = (c) => {
    const m = /^rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return 0;
    const p = m[1].split(',');
    return p.length >= 4 ? parseFloat(p[3]) : 1;
  };
  if (!document.body) return false;
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const pos = cs.position;
    if (pos !== 'fixed' && pos !== 'absolute') continue;
    if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    const l = Math.max(0, r.left), t = Math.max(0, r.top);
    const rr = Math.min(vw, r.right), bb = Math.min(vh, r.bottom);
    if (rr - l <= 0 || bb - t <= 0) continue;
    const covers = ((rr - l) * (bb - t)) / vpArea;
    const z = parseInt(cs.zIndex, 10) || 0;
    const role = (el.getAttribute('role') || '').toLowerCase();
    const modal = role === 'dialog' || role === 'alertdialog' || el.getAttribute('aria-modal') === 'true';
    if ((covers > 0.85 && alphaOf(cs.backgroundColor) > 0.05) ||
        (modal && covers > 0.03) ||
        (covers > 0.18 && (z >= 10 || pos === 'fixed'))) return true;
  }
  return false;
}

async function checkOverlay() {
  if (!tab) return;
  try {
    const [{ result: found }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: detectOverlay,
    });
    $('notice').hidden = !found;
  } catch (_) { /* 접근 못 하는 페이지 */ }
}

async function loadShortcut() {
  try {
    const cmds = await chrome.commands.getAll();
    const c = cmds.find((x) => x.name === 'capture');
    if (c && c.shortcut) $('shortcut').textContent = c.shortcut;
  } catch (_) {}
}

/* ---------- 결과 표시 ---------- */

const nf = (n) => Number(n || 0).toLocaleString();

function size(bytes) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
    : Math.round(bytes / 1024).toLocaleString() + ' KB';
}

function ok(r) {
  const s = r.stats || {};
  const bits = [];
  if (s.images) bits.push(`사진 ${nf(s.images)}장`);
  if (s.fonts) bits.push(`글꼴 ${nf(s.fonts)}개`);
  if (s.frames) bits.push(`안쪽 화면 ${nf(s.frames)}개`);
  if (s.overlays) bits.push(`걷어낸 안내창 ${nf(s.overlays)}개`);
  result.innerHTML = `
    <div class="card ok">
      <b>저장했어요 · ${size(r.bytes)}</b>
      <div class="file">${esc(r.name)}</div>
      <div class="stats">화면에 보이던 ${nf(s.kept)}개를 담고,
        안 보이던 ${nf((s.shells || 0) + (s.dropped || 0))}개는 비웠어요.${
        bits.length ? '<br>' + bits.join(' · ') : ''}</div>
    </div>`;
}

function fail(msg) {
  result.innerHTML = `<div class="card err"><b>저장하지 못했어요</b><div class="stats">${esc(msg)}</div></div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- 캡처 ---------- */

async function capture() {
  go.disabled = true;
  const label = go.innerHTML;
  go.innerHTML = '<span class="spinner"></span>저장하는 중…';
  result.innerHTML = '';
  try {
    if (!tab) throw new Error('탭을 찾지 못했어요.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'VSNAP_CAPTURE', opts });
    if (!r) throw new Error('페이지가 응답하지 않아요. 새로고침한 뒤 다시 시도해 주세요.');
    if (!r.ok) throw new Error(r.error || '알 수 없는 문제가 생겼어요.');
    ok(r);
  } catch (e) {
    fail((e && e.message) || String(e));
  } finally {
    go.disabled = false;
    go.innerHTML = label;
  }
}

/* ---------- 시작 ---------- */

async function init() {
  // 확장 밖(브라우저에서 popup.html 을 직접 열었을 때)에서도 모양을 확인할 수 있게 한다.
  const inExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.tabs;
  if (!inExtension) {
    paintOptions(); wire();
    $('pageTitle').textContent = '일상 속 상상 : 네이버 블로그';
    $('pageMeta').textContent = '1280 × 720 · 아래로 600px 내린 위치';
    $('shortcut').textContent = '⌥⇧S';
    if (location.hash.includes('notice')) $('notice').hidden = false;
    if (location.hash.includes('done')) {
      ok({ bytes: 449639, name: 'Npay 증권_20260829-125953.html',
           stats: { kept: 238, shells: 766, dropped: 23, images: 2, fonts: 4, frames: 1, overlays: 1 } });
    }
    return;
  }
  const { opts: saved } = await chrome.storage.local.get('opts');
  opts = { ...DEFAULTS, ...(saved || {}) };
  paintOptions();
  wire();
  go.addEventListener('click', capture);
  await Promise.all([loadTab(), loadShortcut()]);
  await checkOverlay();
}

init();
