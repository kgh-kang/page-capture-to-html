// Capture to HTML — service worker
// 콘텐츠 스크립트는 MV3에서 교차 출처 fetch 권한이 없으므로,
// 이미지/폰트/CSS 같은 리소스 다운로드는 전부 여기서 대신 처리한다.

const MAX_BYTES = 12 * 1024 * 1024;

const DEFAULT_OPTS = {
  crop: true,          // 뷰포트 밖은 잘라내기 (열었을 때 화면 그대로)
  occlusion: true,     // 다른 요소에 가려진 것도 '안 보임'으로 처리
  pin: true,           // 측정된 크기를 px로 고정 (픽셀 정확도 ↑)
  images: true,        // 이미지 data URI 로 embed
  fonts: true,         // 웹폰트 embed
  frames: true,        // 같은 출처 iframe 재귀 캡처
  restoreScroll: true, // 내부 스크롤 위치 복원용 초소형 스크립트 삽입
  dropOverlay: false,  // 화면을 덮은 안내 모달·배너를 걷어내고 그 아래를 저장
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'VSNAP_FETCH') {
    fetchBinary(msg.url).then(respond, (e) => respond({ error: String(e && e.message || e) }));
    return true;
  }
  if (msg.type === 'VSNAP_FETCH_TEXT') {
    fetchText(msg.url).then(respond, (e) => respond({ error: String(e && e.message || e) }));
    return true;
  }
});

// 단축키로 저장하면 팝업이 안 열리므로 결과를 알 길이 없다. 배지로 알린다.
function badge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
    if (text) setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
  } catch (_) {}
}

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'capture') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^(https?|file):/.test(tab.url || '')) return badge('!', '#c0392b');
    badge('…', '#666666');
    const { opts } = await chrome.storage.local.get('opts');
    const r = await capture(tab.id, { ...DEFAULT_OPTS, ...(opts || {}) });
    badge(r && r.ok ? '✓' : '!', r && r.ok ? '#1c7a2e' : '#c0392b');
  } catch (e) {
    console.error('[page-capture]', e);
    badge('!', '#c0392b');
  }
});

async function capture(tabId, opts) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  return chrome.tabs.sendMessage(tabId, { type: 'VSNAP_CAPTURE', opts });
}

// 스킴 화이트리스트 — 확장이 임의 스킴을 대신 열어주지 않게
function assertUrl(url) {
  if (!/^(https?|file|blob|data):/i.test(String(url))) throw new Error('허용되지 않는 주소');
}

async function fetchBinary(url) {
  assertUrl(url);
  const res = await fetch(url, { credentials: 'include', cache: 'force-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('too large: ' + buf.length);
  const mime = (res.headers.get('content-type') || '').split(';')[0].trim() || guessMime(url);
  return { dataUrl: 'data:' + mime + ';base64,' + b64(buf), bytes: buf.length };
}

async function fetchText(url) {
  assertUrl(url);
  const res = await fetch(url, { credentials: 'include', cache: 'force-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return { text: await res.text() };
}

function b64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function guessMime(url) {
  const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url);
  const ext = m ? m[1].toLowerCase() : '';
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
    css: 'text/css',
  }[ext] || 'application/octet-stream';
}
