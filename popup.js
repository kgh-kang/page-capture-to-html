const DEFAULTS = {
  crop: true, occlusion: true, pin: true,
  images: true, fonts: true, frames: true, restoreScroll: true,
  dropOverlay: false, freeze: false,
};
const TOGGLES = ['freeze', 'dropOverlay', 'occlusion', 'images', 'fonts', 'frames', 'restoreScroll', 'pin'];
const CAPTURABLE = /^(https?|file):/;

const $ = (id) => document.getElementById(id);
const go = $('go');
const result = $('result');
const notice = $('notice');
let opts = { ...DEFAULTS };
let tab = null;
let overlayFound = false;

/* ---------- 문구 ---------- */

// 확장 안에서는 chrome.i18n, 밖(미리보기)에서는 messages.json 을 직접 읽는다.
let messages = null;
function t(key, ...args) {
  if (messages) {
    const m = messages[key];
    if (!m) return key;
    return m.message.replace(/\$([A-Z]+)\$/g, (_, name) => {
      const ph = m.placeholders && m.placeholders[name.toLowerCase()];
      const i = ph ? parseInt(String(ph.content).slice(1), 10) - 1 : 0;
      return args[i] != null ? args[i] : '';
    });
  }
  try { return chrome.i18n.getMessage(key, args.map(String)) || key; } catch (_) { return key; }
}

async function loadMessages() {
  if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage('extName')) {
    document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0];
    return;
  }
  const lang = (navigator.language || 'ko').startsWith('en') ? 'en' : 'ko';
  document.documentElement.lang = lang;
  try {
    messages = await (await fetch(`_locales/${lang}/messages.json`)).json();
  } catch (_) { /* 문구 없이도 화면은 뜬다 */ }
}

function paintText() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}

/* ---------- 목록 높이 ---------- */

const POPUP_MAX = 598;   // 크롬 팝업이 허용하는 높이(600px)에서 테두리 몫을 뺀 값

// 헤더·선택·버튼은 고정하고 옵션 목록만 스크롤시킨다. 위쪽 요소들의 높이가
// 페이지 제목 길이나 배너 유무에 따라 달라지므로 그때그때 다시 잰다.
function fitOptions() {
  const adv = $('adv');
  const opts_ = document.querySelector('.opts');
  if (!adv.open) { opts_.style.maxHeight = ''; return; }
  const top = adv.getBoundingClientRect().top;
  const summary = adv.querySelector('summary').getBoundingClientRect().height;
  opts_.style.maxHeight = Math.max(120, POPUP_MAX - top - summary - 2) + 'px';
}

/* ---------- 옵션 상태 ---------- */

function paintMode() {
  $('c-crop').classList.toggle('on', opts.crop);
  $('c-full').classList.toggle('on', !opts.crop);
  $('c-crop').querySelector('input').checked = opts.crop;
  $('c-full').querySelector('input').checked = !opts.crop;
}

function paintOptions() {
  paintMode();
  for (const k of TOGGLES) $(k).checked = !!opts[k];
  // 굳히면 자동 실행 코드가 아예 안 들어가므로 '열 때 보던 위치로' 는 쓰이지 않는다.
  const scroll = $('restoreScroll');
  scroll.disabled = !!opts.freeze;
  $('opt-scroll').classList.toggle('muted', !!opts.freeze);
  $('scrollWhy').hidden = !opts.freeze;
  paintNotice();
  fitOptions();
}

function save() {
  try { chrome.storage.local.set({ opts }); } catch (_) {}
}

function wire() {
  for (const el of document.querySelectorAll('input[name=mode]')) {
    el.addEventListener('change', () => { opts.crop = el.value === 'crop'; paintOptions(); save(); });
  }
  for (const k of TOGGLES) {
    $(k).addEventListener('change', (e) => { opts[k] = e.target.checked; paintOptions(); save(); });
  }
  $('adv').addEventListener('toggle', fitOptions);
  addEventListener('resize', fitOptions);
}

/* ---------- 덮개 안내 ---------- */

function paintNotice() {
  if (!overlayFound) { notice.innerHTML = ''; return; }
  const on = !!opts.dropOverlay;
  notice.innerHTML = `
    <div class="notice-box">
      <b>${esc(t(on ? 'noticeOnTitle' : 'noticeTitle'))}</b>
      <p>${esc(t(on ? 'noticeOnDesc' : 'noticeDesc'))}</p>
      <label class="opt" style="padding:0;border:0">
        <span class="sw"><input type="checkbox" id="noticeToggle"${on ? ' checked' : ''}><i></i></span>
        <span class="txt"><b>${esc(t('noticeToggle'))}</b></span>
      </label>
    </div>`;
  $('noticeToggle').addEventListener('change', (e) => {
    opts.dropOverlay = e.target.checked; paintOptions(); save();
  });
  fitOptions();
}

/* ---------- 현재 페이지 ---------- */

async function loadTab() {
  const [x] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = x;
  if (!tab) { $('pageMeta').textContent = t('errNoTab'); return; }

  $('pageTitle').textContent = tab.title || tab.url || '';
  if (!CAPTURABLE.test(tab.url || '')) { $('pageMeta').textContent = t('cannotCapture'); return; }

  try {
    const [{ result: v }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ w: innerWidth, h: innerHeight, y: Math.round(scrollY) }),
    });
    $('pageMeta').textContent = t('viewport', v.w, v.h) +
      (v.y > 0 ? t('scrolledBy', v.y.toLocaleString()) : t('atTop'));
    go.disabled = false;
  } catch (_) {
    $('pageMeta').textContent = t('needReload');
  }
}

async function loadShortcut() {
  const el = $('shortcutValue');
  let text = t('shortcutNone');
  try {
    const c = (await chrome.commands.getAll()).find((x) => x.name === 'capture');
    if (c && c.shortcut) text = c.shortcut;
  } catch (_) {}
  el.textContent = text;
  // chrome:// 는 링크로 못 열고 탭으로만 열 수 있다
  $('editShortcut').addEventListener('click', () => {
    try { chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); } catch (_) {}
  });
}

// content.js 를 주입하지 않고 가볍게 덮개만 확인한다.
function detectOverlay() {
  const vw = innerWidth, vh = innerHeight, vpArea = Math.max(1, vw * vh);
  const alphaOf = (c) => {
    const m = /^rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return 0;
    const p = m[1].split(',');
    return p.length >= 4 ? parseFloat(p[3]) : 1;
  };
  if (!document.body) return false;
  let bodyLen = 1;
  try { bodyLen = Math.max(1, (document.body.innerText || '').length); } catch (_) {}
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') continue;
    if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    const l = Math.max(0, r.left), tp = Math.max(0, r.top);
    const rr = Math.min(vw, r.right), bb = Math.min(vh, r.bottom);
    if (rr - l <= 0 || bb - tp <= 0) continue;
    if ((el.innerText || '').length / bodyLen > 0.4) continue;
    const covers = ((rr - l) * (bb - tp)) / vpArea;
    const z = parseInt(cs.zIndex, 10) || 0;
    const role = (el.getAttribute('role') || '').toLowerCase();
    const modal = role === 'dialog' || role === 'alertdialog' || el.getAttribute('aria-modal') === 'true';
    if ((covers > 0.85 && alphaOf(cs.backgroundColor) > 0.05) ||
        (modal && covers > 0.03) || (z >= 10 && covers > 0.18)) return true;
  }
  return false;
}

async function checkOverlay() {
  if (!tab || !CAPTURABLE.test(tab.url || '')) return;
  try {
    const [{ result: found }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: detectOverlay,
    });
    overlayFound = !!found;
    paintNotice();
  } catch (_) {}
}

/* ---------- 결과 ---------- */

const nf = (n) => Number(n || 0).toLocaleString();
const size = (b) => b >= 1024 * 1024
  ? (b / 1024 / 1024).toFixed(1) + ' MB'
  : Math.round(b / 1024).toLocaleString() + ' KB';

function ok(r) {
  const s = r.stats || {};
  const bits = [];
  if (s.images) bits.push(t('statImages', nf(s.images)));
  if (s.fonts) bits.push(t('statFonts', nf(s.fonts)));
  if (s.frames) bits.push(t('statFrames', nf(s.frames)));
  if (s.overlays) bits.push(t('statOverlays', nf(s.overlays)));
  result.innerHTML = `
    <div class="card ok">
      <b>${esc(t('savedTitle', size(r.bytes)))}</b>
      <div class="file">${esc(r.name)}</div>
      <div class="stats">${esc(t('savedStats', nf(s.kept), nf((s.shells || 0) + (s.dropped || 0))))}${
        bits.length ? '<br>' + esc(bits.join(' · ')) : ''}<br>${esc(t('whereSaved'))}</div>
    </div>`;
  fitOptions();
}

// 원문 오류는 영문 스택이라 그대로 보여주면 아무 도움이 안 된다.
function friendly(msg) {
  const m = String(msg || '');
  if (/Receiving end does not exist|Could not establish|message port closed/i.test(m)) return t('errNoResponse');
  if (/Cannot access|chrome:\/\/|extension:\/\//i.test(m)) return t('errChromePage');
  if (/Extension context invalidated/i.test(m)) return t('errStale');
  if (m === t('errBusy') || /이미 저장하는 중|already running/i.test(m)) return t('errBusy');
  return t('errUnknown');
}

function fail(msg) {
  result.innerHTML = `<div class="card err"><b>${esc(t('failedTitle'))}</b>
    <div class="stats">${esc(msg)}</div></div>`;
  fitOptions();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 캡처 ---------- */

async function capture() {
  go.disabled = true;
  go.setAttribute('aria-busy', 'true');
  const label = go.innerHTML;
  go.innerHTML = `<span class="spinner"></span>${esc(t('saving'))}`;
  result.innerHTML = '';
  try {
    if (!tab) throw new Error(t('errNoTab'));
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'VSNAP_CAPTURE', opts });
    if (!r) throw new Error('no response');
    if (!r.ok) throw new Error(r.error || 'unknown');
    ok(r);
  } catch (e) {
    console.error('[page-capture]', e);
    fail(friendly(e && e.message));
  } finally {
    go.disabled = false;
    go.removeAttribute('aria-busy');
    go.innerHTML = label;
  }
}

/* ---------- 시작 ---------- */

async function init() {
  await loadMessages();
  paintText();

  const inExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.tabs;
  if (!inExtension) {                       // 브라우저에서 popup.html 을 직접 열었을 때
    paintOptions(); wire();
    $('pageTitle').textContent = '일상 속 상상 : 네이버 블로그';
    $('pageMeta').textContent = t('viewport', 1280, 720) + t('scrolledBy', '600');
    $('shortcutValue').textContent = '⌥⇧S';
    go.disabled = false;
    if (location.hash.includes('notice')) { overlayFound = true; paintNotice(); }
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
