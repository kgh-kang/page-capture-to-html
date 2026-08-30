/* Capture to HTML — content script
 *
 * 핵심 아이디어
 *  1) 지금 이 순간의 뷰포트를 기준으로 요소별 "실제로 보이는가"를 판정한다.
 *     - display:none            → 통째로 버림 (자리도 차지 안 하므로 레이아웃 영향 없음)
 *     - visibility/opacity/0크기 → 내용만 버리고 빈 껍데기로 남김 (자리는 차지하므로)
 *     - 뷰포트/overflow 클립 밖  → 빈 껍데기
 *     - 다른 요소에 가려짐       → 빈 껍데기
 *  2) 원본 CSS는 한 줄도 안 가져온다. 대신 getComputedStyle 결과를
 *     (a) 태그별 UA 기본값, (b) 부모의 상속값 과 diff 해서 달라진 것만 남긴다.
 *     → 애니메이션/hover/미디어쿼리/미사용 CSS가 전부 사라지고, 화면에 찍힌 상태 그대로 굳는다.
 *  3) 같은 style 문자열은 클래스 하나로 합쳐서 용량을 줄인다.
 */
(() => {
'use strict';
if (window.__VSNAP__) return;
window.__VSNAP__ = true;

/* ---------- CSS 속성 분류 ---------- */

// 상속되는 속성: 부모 계산값과 같으면 굳이 안 적어도 된다.
const INHERITED = new Set((
  'border-collapse border-spacing caption-side caret-color color cursor direction empty-cells ' +
  'font-family font-feature-settings font-kerning font-optical-sizing font-palette font-size font-size-adjust ' +
  'font-stretch font-style font-synthesis-small-caps font-synthesis-style font-synthesis-weight font-variant ' +
  'font-variant-alternates font-variant-caps font-variant-east-asian font-variant-emoji font-variant-ligatures ' +
  'font-variant-numeric font-variant-position font-variation-settings font-weight forced-color-adjust ' +
  'hyphenate-character hyphens image-orientation image-rendering letter-spacing line-break line-height ' +
  'list-style-image list-style-position list-style-type math-depth math-shift math-style orphans overflow-wrap ' +
  'paint-order print-color-adjust quotes ruby-align ruby-position scrollbar-color tab-size text-align ' +
  'text-align-last text-anchor text-combine-upright text-decoration-skip-ink text-emphasis-color ' +
  'text-emphasis-position text-emphasis-style text-indent text-justify text-orientation text-rendering ' +
  'text-shadow text-size-adjust text-transform text-underline-offset text-underline-position text-wrap ' +
  'text-wrap-mode text-wrap-style visibility white-space white-space-collapse widows word-break word-spacing ' +
  'writing-mode accent-color color-scheme ' +
  '-webkit-font-smoothing -webkit-text-fill-color -webkit-text-stroke-color -webkit-text-stroke-width ' +
  '-webkit-text-size-adjust -webkit-text-orientation -webkit-writing-mode -webkit-locale -webkit-rtl-ordering ' +
  '-webkit-border-horizontal-spacing -webkit-border-vertical-spacing -webkit-print-color-adjust ' +
  'fill fill-opacity fill-rule stroke stroke-opacity stroke-width stroke-linecap stroke-linejoin ' +
  'stroke-dasharray stroke-dashoffset stroke-miterlimit marker-end marker-mid marker-start clip-rule ' +
  'color-interpolation color-interpolation-filters shape-rendering dominant-baseline glyph-orientation-vertical'
).split(/\s+/));

// 정적 스냅샷에 의미 없거나(애니메이션·상호작용), 물리 속성과 중복(논리 속성)인 것들.
const SKIP = new Set((
  'animation animation-composition animation-delay animation-direction animation-duration animation-fill-mode ' +
  'animation-iteration-count animation-name animation-play-state animation-range animation-range-end ' +
  'animation-range-start animation-timeline animation-timing-function ' +
  'transition transition-behavior transition-delay transition-duration transition-property transition-timing-function ' +
  'cursor pointer-events user-select -webkit-user-select -webkit-user-drag -webkit-user-modify ' +
  '-webkit-tap-highlight-color touch-action will-change scroll-behavior ' +
  'overscroll-behavior overscroll-behavior-block overscroll-behavior-inline overscroll-behavior-x overscroll-behavior-y ' +
  'contain content-visibility container container-name container-type ' +
  'view-transition-name view-transition-class anchor-name anchor-scope position-anchor position-try ' +
  'position-try-fallbacks position-try-order position-visibility field-sizing interactivity ' +
  'timeline-scope scroll-timeline scroll-timeline-axis scroll-timeline-name ' +
  'view-timeline view-timeline-axis view-timeline-inset view-timeline-name ' +
  'block-size inline-size min-block-size min-inline-size max-block-size max-inline-size ' +
  'inset-block inset-block-start inset-block-end inset-inline inset-inline-start inset-inline-end ' +
  'margin-block margin-block-start margin-block-end margin-inline margin-inline-start margin-inline-end ' +
  'padding-block padding-block-start padding-block-end padding-inline padding-inline-start padding-inline-end ' +
  'border-block-start-width border-block-end-width border-inline-start-width border-inline-end-width ' +
  'border-block-start-style border-block-end-style border-inline-start-style border-inline-end-style ' +
  'border-block-start-color border-block-end-color border-inline-start-color border-inline-end-color ' +
  'border-start-start-radius border-start-end-radius border-end-start-radius border-end-end-radius ' +
  '-webkit-app-region app-region -webkit-locale'
).split(/\s+/));

// url(...) 이 들어갈 수 있어서 data URI 로 바꿔줘야 하는 속성.
const URL_PROPS = new Set([
  'background-image', 'border-image-source', 'list-style-image',
  'mask-image', '-webkit-mask-image', 'shape-outside', 'content',
]);

// 캡처에서 아예 제외하는 태그.
const DROP_TAGS = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'STYLE', 'TITLE', 'BASE']);

const URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/g;

/* ---------- 메시지 진입점 ---------- */

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (!msg) return;
  if (msg.type === 'VSNAP_CAPTURE') {
    main(msg.opts || {}).then(respond, (e) => {
      console.error('[page-capture]', e);
      respond({ ok: false, error: (e && e.message) || String(e) });
    });
    return true;
  }
});

/* ---------- 리소스 다운로드 (service worker 경유) ---------- */

const resCache = new Map();

function ask(message, timeout = 10000) {
  // 서비스 워커가 잠들거나 호스트가 응답을 안 하면 콜백이 영영 안 온다.
  // 그러면 runPool 이 안 끝나고 busy 플래그가 잠긴 채로 남는다.
  return new Promise((res) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; res(v); } };
    setTimeout(() => finish(null), timeout);
    try { chrome.runtime.sendMessage(message, (r) => { void chrome.runtime.lastError; finish(r); }); }
    catch (_) { finish(null); }
  });
}

function toDataURL(url) {
  if (!url) return Promise.resolve(null);
  if (url.startsWith('data:')) return Promise.resolve(url);
  if (url.startsWith('blob:')) {
    // blob: 은 페이지 컨텍스트에서만 유효하므로 여기서 직접 읽는다.
    const p = fetch(url).then((r) => r.blob()).then(blobToDataURL).catch(() => null);
    resCache.set(url, p);
    return p;
  }
  if (resCache.has(url)) return resCache.get(url);
  const p = ask({ type: 'VSNAP_FETCH', url }).then((r) => (r && r.dataUrl) || null);
  resCache.set(url, p);
  return p;
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

/* ---------- 태그별 UA 기본 스타일 (샌드박스 iframe 에서 측정) ---------- */

let sandboxDoc = null;
let sandboxFrame = null;
const defCache = new Map();

function openSandbox() {
  sandboxFrame = document.createElement('iframe');
  sandboxFrame.setAttribute('aria-hidden', 'true');
  sandboxFrame.style.cssText =
    'position:fixed!important;left:-99999px!important;top:0!important;width:1024px!important;' +
    'height:768px!important;border:0!important;opacity:0!important;pointer-events:none!important;' +
    'visibility:hidden!important;z-index:-2147483647!important';
  document.documentElement.appendChild(sandboxFrame);
  const d = sandboxFrame.contentDocument;
  d.open();
  d.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  d.close();
  sandboxDoc = d;
}

function closeSandbox() {
  if (sandboxFrame) sandboxFrame.remove();
  sandboxFrame = null; sandboxDoc = null;
}

// UA 스타일시트가 참조하는 속성/상태. 이걸 빼놓고 기본값을 재면
// href 없는 <a> 처럼 "UA 규칙이 아예 안 걸린 상태"와 비교하게 되어,
// text-decoration:none 같은 선언이 '기본값과 같다'며 통째로 누락된다.
const UA_ATTRS = ['type', 'href', 'disabled', 'checked', 'selected', 'multiple', 'size',
  'open', 'hidden', 'dir', 'controls', 'readonly', 'required', 'reversed', 'start',
  'align', 'nowrap', 'inert', 'popover', 'contenteditable'];
const BOOL_ATTRS = new Set(['disabled', 'checked', 'selected', 'multiple', 'open', 'hidden',
  'controls', 'readonly', 'required', 'reversed', 'inert']);

function uaSignature(el) {
  if (!el || !el.getAttribute) return '';
  const out = [];
  for (const a of UA_ATTRS) {
    if (BOOL_ATTRS.has(a)) {
      const prop = a === 'readonly' ? 'readOnly' : a;
      if (el[prop] === true || el.hasAttribute(a)) out.push(a + '=');
    } else if (a === 'href') {
      if (el.hasAttribute('href')) out.push('href=#');   // 값은 UA 스타일에 무관
    } else if (el.hasAttribute(a)) {
      out.push(a + '=' + el.getAttribute(a));
    }
  }
  return out.join('&');
}

function defaultsFor(el, tag, pseudo) {
  const sig = uaSignature(el);
  const key = tag + '|' + (pseudo || '') + '|' + sig;
  let m = defCache.get(key);
  if (m) return m;
  m = new Map();
  let measured = false;
  if (!sandboxDoc) openSandbox();
  try {
    const el2 = sandboxDoc.createElement(tag);
    for (const pair of sig ? sig.split('&') : []) {
      const eq = pair.indexOf('=');
      try { el2.setAttribute(pair.slice(0, eq), pair.slice(eq + 1)); } catch (_) {}
    }
    const el = el2;
    sandboxDoc.body.appendChild(el);
    const cs = sandboxDoc.defaultView.getComputedStyle(el, pseudo || null);
    for (let i = 0; i < cs.length; i++) {
      const p = cs.item(i);
      m.set(p, cs.getPropertyValue(p));
    }
    el.remove();
    measured = true;
  } catch (_) { /* 알 수 없는 태그 등 */ }
  // 실패한 결과(빈 Map)를 캐시하면 그 태그는 이후 계속 "기본값이 하나도 없는" 상태가 되어
  // 요소마다 350여 개 속성이 전부 쏟아진다. 파일이 수십 MB 로 부푸는데 오류는 안 남는다.
  if (measured) defCache.set(key, m);
  return m;
}

/* ---------- 기하 유틸 ---------- */

function intersect(a, b) {
  const l = Math.max(a.l, b.l), t = Math.max(a.t, b.t);
  const r = Math.min(a.r, b.r), bo = Math.min(a.b, b.b);
  if (r - l <= 0.5 || bo - t <= 0.5) return null;
  return { l, t, r, b: bo };
}

function rectOf(dom) {
  return { l: dom.left, t: dom.top, r: dom.right, b: dom.bottom };
}

/* ---------- 문서 하나를 캡처 ---------- */

async function captureDocument(win, opts, depth) {
  const doc = win.document;
  const gcs = (el, pseudo) => win.getComputedStyle(el, pseudo || null);
  // 실제 뷰포트. 가림 판정과 덮개 탐지는 언제나 이 기준이다
  // (화면 밖은 히트테스트가 불가능하다).
  const VP = { l: 0, t: 0, r: win.innerWidth, b: win.innerHeight };
  // 무엇을 '보이는 것'으로 칠지의 범위. '페이지 전체' 를 고르면 문서 끝까지 넓힌다.
  const de = doc.documentElement;
  const SCOPE = opts.crop ? VP : {
    l: -win.scrollX, t: -win.scrollY,
    r: -win.scrollX + Math.max(de.scrollWidth, win.innerWidth),
    b: -win.scrollY + Math.max(de.scrollHeight, win.innerHeight),
  };

  const out = document.implementation.createHTMLDocument('');
  const jobs = [];                 // 비동기 리소스 작업 (DOM 순회가 끝난 뒤 한꺼번에 실행)
  const styleTargets = [];         // { node, parts } — 클래스 배정은 전부 끝난 뒤에
  const pseudoTargets = [];        // { node, before, after }
  const scrollTargets = [];        // 내부 스크롤 위치를 복원할 노드
  const usedFamilies = new Set();
  const anchors = [];  // 스크롤 정렬 기준점 후보 { node, top, area }
  const stats = { kept: 0, shells: 0, dropped: 0, images: 0, imagesFailed: 0, fonts: 0, frames: 0, overlays: 0 };

  /* --- 화면을 덮은 팝업 골라내기 --- */

  // 안내 모달·쿠키 배너처럼 본문 위에 얹혀 시야를 막는 것들. opts.dropOverlay 가 켜지면
  // 이것들을 통째로 버리고, 가림 판정에서도 없는 셈 친다 → 그 아래 내용이 되살아난다.
  function findOverlays() {
    const found = [];
    const vpArea = Math.max(1, (VP.r - VP.l) * (VP.b - VP.t));
    // 본문 대비 글자량. SPA 의 앱 루트(position:absolute; inset:0)를 덮개로 잡으면
    // 페이지 전체가 사라지고 파일에 <body> 만 남는다.
    let bodyLen = 1;
    try { bodyLen = Math.max(1, (doc.body.innerText || '').length); } catch (_) {}
    let nodes;
    try { nodes = doc.body ? doc.body.querySelectorAll('*') : []; } catch (_) { return found; }
    for (const el of nodes) {
      let cs;
      try { cs = gcs(el); } catch (_) { continue; }
      const pos = cs.position;
      if (pos !== 'fixed' && pos !== 'absolute') continue;
      if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0) continue;

      const r = intersect(rectOf(el.getBoundingClientRect()), VP);
      if (!r) continue;
      const covers = ((r.r - r.l) * (r.b - r.t)) / vpArea;
      const z = parseInt(cs.zIndex, 10) || 0;
      const role = (el.getAttribute('role') || '').toLowerCase();
      const modalAttr = role === 'dialog' || role === 'alertdialog' || el.getAttribute('aria-modal') === 'true';

      // 페이지 글자의 40% 넘게 품고 있으면 그건 본문이지 덮개가 아니다.
      let mine = 0;
      try { mine = (el.innerText || '').length; } catch (_) {}
      if (mine / bodyLen > 0.4) continue;

      // 셋 중 하나면 덮개로 본다. 떠 있는 것(fixed)만 인정해서
      // 고정 사이드바나 앱 루트 같은 absolute 레이아웃 요소를 걸러낸다.
      const isDim = pos === 'fixed' && covers > 0.85 && alphaOf(cs.backgroundColor) > 0.05;
      const isModal = modalAttr && covers > 0.03;
      const isFloatingPanel = pos === 'fixed' && z >= 10 && covers > 0.18;
      if (!isDim && !isModal && !isFloatingPanel) continue;

      // 이미 잡힌 덮개 안에 들어 있으면 따로 셀 필요가 없다.
      if (found.some((o) => o.contains(el))) continue;
      found.push(el);
    }
    return found;
  }

  const overlays = opts.dropOverlay ? findOverlays() : [];
  const isOverlayNode = (n) => overlays.some((o) => o === n || o.contains(n));

  /* --- 가시성 판정 --- */

  // elementFromPoint 는 shadow DOM 안을 들여다보지 않고 host 를 돌려주는데,
  // Node.contains() 는 shadow 경계를 넘지 못한다. 그래서 비교는 문서 트리에 있는
  // 가장 바깥 host 기준으로 해야 웹 컴포넌트 내용이 통째로 '가려짐' 처리되지 않는다.
  function hostOf(el) {
    let n = el;
    for (let i = 0; i < 20; i++) {
      const root = n.getRootNode ? n.getRootNode() : null;
      if (root && root.host) n = root.host; else break;
    }
    return n;
  }

  function alphaOf(color) {
    if (!color || color === 'transparent') return 0;
    const m = /^rgba?\(([^)]+)\)/.exec(color);
    if (!m) return 1;
    const parts = m[1].split(',');
    return parts.length >= 4 ? parseFloat(parts[3]) : 1;
  }

  // 실제로 뭔가를 칠하는 요소인가. 클릭 영역을 넓히려고 덮어둔 투명 레이어는
  // 위에 있어도 아래 내용을 가리지 않는다.
  function paintsAnything(el) {
    let cs;
    try { cs = gcs(el); } catch (_) { return true; }
    if (parseFloat(cs.opacity) === 0) return false;
    if (alphaOf(cs.backgroundColor) > 0.05) return true;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    return paintsOwnContent(el);
  }

  function isOccluded(el, rect, clip) {
    // elementsFromPoint 는 히트테스트라 pointer-events:none 요소를 건너뛴다.
    // 그러면 스택에서 자기 자신을 영영 못 만나고, 뒤에 있는 형제 배경을 만나
    // "가려짐"으로 오판한다 — 화면에는 멀쩡히 보이는 글자가 통째로 사라진다.
    // (pointer-events 는 상속되므로 부모 하나만 걸려도 서브트리 전체가 날아갔다.)
    let scs;
    try { scs = gcs(el); } catch (_) { return false; }
    if (scs.pointerEvents === 'none') return false;

    const self = hostOf(el);
    const r = intersect(rect, clip);
    if (!r) return true;
    const xs = [r.l + (r.r - r.l) * 0.5, r.l + 1.5, r.r - 1.5, r.l + 1.5, r.r - 1.5];
    const ys = [r.t + (r.b - r.t) * 0.5, r.t + 1.5, r.t + 1.5, r.b - 1.5, r.b - 1.5];
    let checked = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      // 히트테스트는 뷰포트 안에서만 가능하다. '페이지 전체' 모드에서는
      // 화면 밖 요소가 여기로 오는데, 검사도 못 한 걸 가려졌다고 하면 안 된다.
      if (x < 0 || y < 0 || x > VP.r || y > VP.b) continue;
      checked++;
      // 위에서부터 훑으며 '실제로 칠하는' 첫 요소를 찾는다.
      const stack = doc.elementsFromPoint(x, y);
      let blocked = false;
      for (const hit of stack) {
        if (hit === self || self.contains(hit) || hit.contains(self)) break;  // 나까지 도달 = 안 가려짐
        if (overlays.length && isOverlayNode(hit)) continue;                  // 걷어낼 덮개는 무시
        if (paintsAnything(hit)) { blocked = true; break; }
      }
      // 한 지점이라도 뚫려 보이면 보이는 것으로 본다 (거짓 양성 방지)
      if (!blocked) return false;
    }
    return checked > 0;
  }

  // 자기 텍스트나 이미지를 직접 그리는 요소만 가림 판정을 한다.
  function paintsOwnContent(el) {
    if (/^(IMG|SVG|CANVAS|VIDEO|INPUT|TEXTAREA|SELECT|BUTTON|PICTURE)$/.test(el.tagName)) return true;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.data.trim()) return true;
    }
    return false;
  }

  // .sr-only / .visually-hidden 관용구: 1px 상자를 clip 으로 완전히 잘라낸 것.
  // 화면에는 안 나오지만 rect 는 멀쩡해서 그냥 두면 스크린리더 텍스트가 딸려 온다.
  function clippedAway(cs, rect) {
    const cl = cs.clip;
    if (cl && cl !== 'auto') {
      const n = cl.match(/-?[\d.]+/g);
      if (n && n.length === 4) {
        const [t, r, b, l] = n.map(Number);
        if (r - l <= 1 || b - t <= 1) return true;
      }
    }
    const cp = cs.clipPath;
    if (cp && cp !== 'none' && /inset\(\s*(?:50%|100%)/.test(cp)) return true;
    if (rect.r - rect.l <= 2 && rect.b - rect.t <= 2 &&
        (cs.overflow === 'hidden' || cs.overflow === 'clip')) return true;
    return false;
  }

  function visible(el, cs, rect, clip, inherited) {
    if (inherited) return false;
    if (cs.visibility !== 'visible') return false;
    if (cs.contentVisibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    if (rect.r - rect.l <= 0 || rect.b - rect.t <= 0) return false;
    if (clippedAway(cs, rect)) return false;
    if (!intersect(rect, clip)) return false;
    if (opts.occlusion && paintsOwnContent(el) && isOccluded(el, rect, clip)) return false;
    return true;
  }

  /* --- 스타일 diff --- */

  // currentcolor 를 기본값으로 갖는 속성들. color 만 적어두면 알아서 따라오므로
  // 굳이 하나하나 적으면 규칙만 몇 배로 불어난다.
  const CURRENT_COLOR = new Set(['caret-color', 'text-decoration-color', 'text-emphasis-color',
    'column-rule-color', 'row-rule-color', 'outline-color', '-webkit-text-fill-color',
    '-webkit-text-stroke-color', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'text-decoration-color']);
  const SIDES = { 'border-top-color': 'top', 'border-right-color': 'right',
    'border-bottom-color': 'bottom', 'border-left-color': 'left' };

  // 두께는 스타일과 짝으로만 의미가 있다. 원본이 border-width:0 이면 계산값이 기본값과 같아
  // 생략되는데, border-style 만 남으면 출력에서 두께가 initial 값 medium(3px) 으로 해석돼
  // 없던 테두리가 생기고 그만큼 레이아웃까지 밀린다.
  const PAIRED = [
    ['border-top-style', 'border-top-width'],
    ['border-right-style', 'border-right-width'],
    ['border-bottom-style', 'border-bottom-width'],
    ['border-left-style', 'border-left-width'],
    ['outline-style', 'outline-width'],
    ['column-rule-style', 'column-rule-width'],
  ];

  function pairUp(parts, cs) {
    const have = new Set(parts.map((x) => x.slice(0, x.indexOf(':'))));
    for (const [styleProp, widthProp] of PAIRED) {
      if (have.has(styleProp) && !have.has(widthProp)) {
        parts.push(widthProp + ':' + cs.getPropertyValue(widthProp));
      }
    }
    return parts;
  }

  // UA 스타일시트 규칙은 상속을 이긴다. h2{font-size:1.5em} 같은 게 걸린 속성은
  // 계산값이 부모와 같더라도 반드시 적어줘야 출력에서 UA 값으로 튀지 않는다.
  function baseline(defs, p, parentCS) {
    const d = defs.get(p);
    if (!INHERITED.has(p) || !parentCS) return d;
    const neutral = defaultsFor(null, 'div', null).get(p);
    return (d !== undefined && d !== neutral) ? d : parentCS.getPropertyValue(p);
  }

  function diffStyle(el, cs, defTag, parentCS) {
    const defs = defaultsFor(el, defTag, null);
    const color = cs.getPropertyValue('color');
    const transformed = cs.transform !== 'none' || cs.rotate !== 'none' ||
      cs.scale !== 'none' || cs.translate !== 'none' || cs.perspective !== 'none';
    const parts = [];
    for (let i = 0; i < cs.length; i++) {
      const p = cs.item(i);
      if (SKIP.has(p) || p.charCodeAt(0) === 45 && p.charCodeAt(1) === 45) continue;
      const v = cs.getPropertyValue(p);
      if (v === baseline(defs, p, parentCS)) continue;
      if (!transformed && (p === 'transform-origin' || p === 'perspective-origin')) continue;
      if (CURRENT_COLOR.has(p) && v === color) {
        const side = SIDES[p];
        // 테두리 색은 선이 실제로 그려질 때만 필요하다.
        if (!side || cs.getPropertyValue('border-' + side + '-style') === 'none' ||
            parseFloat(cs.getPropertyValue('border-' + side + '-width')) === 0) continue;
      }
      if (p === 'outline-color' && cs.outlineStyle === 'none') continue;
      parts.push(p + ':' + v);
    }
    return pairUp(parts, cs);
  }

  // 측정된 크기를 그대로 못박는다. getComputedStyle 의 width/height 는 content box 값이므로
  // box-sizing 을 content-box 로 강제해야 원래 상자 크기가 재현된다.
  // img/canvas/input 같은 대체 요소는 display:inline 이어도 크기가 먹는다.
  const REPLACED = new Set(['IMG', 'CANVAS', 'VIDEO', 'SVG', 'INPUT', 'SELECT', 'TEXTAREA',
    'IFRAME', 'EMBED', 'OBJECT', 'BUTTON', 'PROGRESS', 'METER', 'img', 'svg']);

  const px = (v) => parseFloat(v) || 0;
  const snap = (v) => Math.floor(v * 100) / 100;

  function pinGeometry(tag, cs) {
    if (tag === 'HTML' || tag === 'BODY') return [];
    const d = cs.display;
    if (d === 'contents' || d === 'none') return [];
    if (d === 'table-column' || d === 'table-column-group') return [];
    if (d === 'inline' && !REPLACED.has(tag)) return [];
    const w = cs.width, h = cs.height;
    if (!w || !h || w === 'auto' || h === 'auto' || w.includes('%') || h.includes('%')) return [];
    // Chrome 의 getComputedStyle().width 는 이미 box-sizing 을 반영한 값이다
    // (border-box 요소면 border box 크기). 여기에 padding/border 를 더하면 그만큼 부푼다.
    //
    // 계산값은 반올림된 값이라 그대로 부모와 자식에 동시에 못박으면 서브픽셀 오차로
    // 자식 폭 합이 부모를 아주 살짝(0.001px 수준) 넘어선다. 그러면 float 옆에 들어가던
    // 블록이 아래로 밀리고, overflow:hidden 이면 그대로 잘려 글자가 사라진다.
    // 내림으로 맞춰두면 자식 쪽이 항상 부모 이하가 된다.
    const ww = snap(px(w)), hh = snap(px(h));
    // 행/행그룹은 폭 지정이 무시되므로 높이만 붙잡는다. 반면 셀의 width 는 표 레이아웃
    // 알고리즘에 강한 힌트로 작동하므로 반드시 넣어야 원본 열 너비가 재현된다.
    if (d === 'table-row' || d === 'table-row-group' ||
        d === 'table-header-group' || d === 'table-footer-group') return ['height:' + hh + 'px'];
    return ['width:' + ww + 'px', 'height:' + hh + 'px'];
  }

  function noteFamilies(cs) {
    const fam = cs.getPropertyValue('font-family');
    if (fam) fam.split(',').forEach((f) => usedFamilies.add(normFamily(f)));
  }

  function registerStyle(node, el, cs, parentCS, defTag, shell) {
    let parts = diffStyle(el, cs, defTag, parentCS);
    if (!shell) noteFamilies(cs);
    if (shell) {
      // 안 보이는 껍데기는 자리만 지키면 되므로 배경/테두리 이미지를 지운다.
      parts = parts.filter((p) => !URL_PROPS.has(p.slice(0, p.indexOf(':'))));
    } else {
      for (let i = 0; i < parts.length; i++) {
        const ci = parts[i].indexOf(':');
        const prop = parts[i].slice(0, ci), val = parts[i].slice(ci + 1);
        if (URL_PROPS.has(prop) && val.includes('url(')) {
          const idx = i;
          jobs.push(async () => { parts[idx] = prop + ':' + await inlineUrls(val); });
        }

      }
    }
    if (defTag === 'HTML' || defTag === 'BODY') {
      // 문서 루트에 계산된 크기를 박으면 문서 전체가 뷰포트 높이로 잘려버린다.
      parts = parts.filter((x) => !/^(width|height|min-width|min-height|max-width|max-height):/.test(x));
    } else if (opts.pin) {
      const pinned = pinGeometry(defTag, cs);
      if (pinned.length) {
        parts = parts.filter((x) => !/^(width|height):/.test(x)).concat(pinned);
      }
    }
    styleTargets.push({ node, parts });
  }

  function registerPseudo(el, cs, node, defTag) {
    const before = pseudoParts(el, cs, '::before', defTag);
    const after = pseudoParts(el, cs, '::after', defTag);
    if (before || after) pseudoTargets.push({ node, before, after });
  }

  function pseudoParts(el, cs, pseudo, defTag) {
    let pcs;
    try { pcs = gcs(el, pseudo); } catch (_) { return null; }
    const content = pcs.getPropertyValue('content');
    if (!content || content === 'none' || content === 'normal') return null;
    const defs = defaultsFor(el, defTag, pseudo);
    noteFamilies(pcs);   // 아이콘 폰트는 거의 항상 가상요소에서 쓰인다
    const parts = [];
    for (let i = 0; i < pcs.length; i++) {
      const p = pcs.item(i);
      if (SKIP.has(p) || p.charCodeAt(0) === 45 && p.charCodeAt(1) === 45) continue;
      const v = pcs.getPropertyValue(p);
      if (v === baseline(defs, p, cs)) continue;
      if (URL_PROPS.has(p) && v.includes('url(')) {
        const idx = parts.length;
        parts.push(p + ':' + v);
        jobs.push(async () => { parts[idx] = p + ':' + await inlineUrls(v); });
        continue;
      }
      parts.push(p + ':' + v);
    }
    if (!parts.some((x) => x.startsWith('content:'))) parts.push('content:' + content);
    return pairUp(parts, pcs);
  }

  async function inlineUrls(value) {
    const urls = [];
    value.replace(URL_RE, (m, q, u) => { if (u && !u.startsWith('data:')) urls.push(u); return m; });
    if (!urls.length) return value;
    const map = new Map();
    await Promise.all(urls.map(async (u) => {
      let abs;
      try { abs = new URL(u, doc.baseURI).href; } catch (_) { return; }
      const d = await toDataURL(abs);
      if (d) map.set(u, d);
    }));
    return value.replace(URL_RE, (m, q, u) => (map.has(u) ? 'url("' + map.get(u) + '")' : m));
  }

  /* --- DOM 순회 --- */

  function flatChildren(el) {
    if (el.shadowRoot) return Array.from(el.shadowRoot.childNodes);
    if (el.tagName === 'SLOT' && el.assignedNodes) {
      const a = el.assignedNodes({ flatten: true });
      if (a.length) return a;
    }
    return Array.from(el.childNodes);
  }

  function build(el, parentCS, clip, absClip, hidden, straddle) {
    const tag = el.tagName;
    if (DROP_TAGS.has(tag)) return null;

    if (overlays.length && overlays.includes(el)) { stats.overlays++; return null; }

    let cs;
    try { cs = gcs(el); } catch (_) { return null; }
    if (cs.display === 'none') { stats.dropped += 1 + el.querySelectorAll('*').length; return null; }

    // position:fixed 는 조상 스크롤 컨테이너의 클립에서 벗어난다.
    // absolute 는 자기 컨테이닝 블록까지만 잘린다 — 중간의 overflow:hidden 이
    // static 이면 컨테이닝 블록이 아니므로 그 자손을 자르지 못한다.
    if (cs.position === 'fixed') clip = SCOPE;
    else if (cs.position === 'absolute') clip = absClip;

    const rect = rectOf(el.getBoundingClientRect());
    // 뷰포트 위쪽에 걸친 블록 안에서 인라인 자식을 비우면 텍스트가 짧아지고,
    // 그만큼 보이던 아래쪽 줄이 화면 밖으로 밀려 올라가 사라진다.
    const inlineInStraddle = straddle && cs.display.startsWith('inline');
    const vis = inlineInStraddle ? !hidden : visible(el, cs, rect, clip, hidden);
    // opacity 는 상속되지 않지만 시각적으로는 조상이 0이면 자손도 전부 안 보인다.
    const childHidden = hidden || parseFloat(cs.opacity) === 0 || cs.contentVisibility === 'hidden';

    // SVG 는 계산 스타일을 일일이 옮기기보다 통째로 복제하는 편이 안전하다.
    if (el.namespaceURI === 'http://www.w3.org/2000/svg' && tag.toLowerCase() === 'svg') {
      if (!vis) { stats.shells++; return shellNode(el, cs, parentCS, 'svg'); }
      stats.kept++;
      const clone = out.importNode(el, true);
      clone.removeAttribute('style');
      registerStyle(clone, el, cs, parentCS, 'svg', false);
      paintSvgDescendants(el, clone, cs);
      jobs.push(async () => { await inlineSvgRefs(clone); });
      return clone;
    }

    let childClip = clip;
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      childClip = intersect(clip, rect) || { l: 0, t: 0, r: 0, b: 0 };
    }
    // 이 요소가 absolute 자손의 컨테이닝 블록이 되는가
    // 문단 하나 안에서만 유효하다. 인라인 사슬을 따라서만 전파하고 블록을 만나면
    // 다시 판정한다 — 안 그러면 스크롤된 문서는 body 부터 걸쳐 있어 전체가 대상이 된다.
    const holdsText = !cs.display.startsWith('inline') &&
      Array.prototype.some.call(el.childNodes, (n) => n.nodeType === 3 && n.data.trim());
    const childStraddle = (straddle && cs.display.startsWith('inline')) ||
      (holdsText && rect.t < 0 && rect.b > 0);
    const makesCB = cs.position !== 'static' || cs.transform !== 'none' ||
      cs.filter !== 'none' || cs.perspective !== 'none' ||
      (cs.contain || '').includes('paint') || (cs.willChange || '').includes('transform');
    const childAbsClip = makesCB ? childClip : absClip;

    const kids = [];
    for (const n of flatChildren(el)) {
      if (n.nodeType === 3) {
        if (vis && n.data) kids.push(out.createTextNode(n.data));
      } else if (n.nodeType === 1) {
        const b = build(n, cs, childClip, childAbsClip, childHidden, childStraddle);
        if (b) kids.push(b);
      }
    }
    const hasElementChild = kids.some((k) => k.nodeType === 1);

    // 안 보이고, 안에 보이는 것도 없다 → 자리만 지키는 빈 껍데기 하나로 접는다.
    if (!vis && !hasElementChild) { stats.shells++; return shellNode(el, cs, parentCS, tag); }

    const outTag = (vis && (tag === 'CANVAS' || tag === 'VIDEO')) ? 'img' : tag.toLowerCase();
    const node = out.createElement(outTag);
    copyAttrs(el, node, outTag);
    registerStyle(node, outTag === 'img' ? null : el, cs, parentCS, outTag === 'img' ? 'img' : tag, !vis);
    if (vis) {
      stats.kept++;
      registerPseudo(el, cs, node, tag);
      specialize(el, node, cs, rect, clip);
      // 정렬 기준점 후보: 흐름 안에 있는 '블록'이면서 자기 내용을 직접 그리는 요소.
      // 인라인 요소는 같은 문단 안 텍스트가 지워지면 위치가 흔들려 기준으로 못 쓴다.
      if (rect.t >= 0 && cs.position !== 'fixed' && cs.position !== 'sticky' &&
          cs.display !== 'inline' && paintsOwnContent(el)) {
        anchors.push({ node, top: rect.t, area: (rect.r - rect.l) * (rect.b - rect.t) });
      }
    } else {
      stats.shells++;
    }
    for (const k of kids) node.appendChild(k);
    if (opts.restoreScroll && (el.scrollTop > 0 || el.scrollLeft > 0)) {
      node.setAttribute('data-vsc', Math.round(el.scrollLeft) + ',' + Math.round(el.scrollTop));
      scrollTargets.push(node);
    }
    return node;
  }

  function shellNode(el, cs, parentCS, tag) {
    const node = out.createElement(tag.toLowerCase());
    // 열을 몇 칸 차지하는지는 CSS 로 재현되지 않는다. 내용을 비운 껍데기여도
    // 이 셋은 남겨야 표의 열 좌표가 유지된다.
    for (const a of ['colspan', 'rowspan', 'span']) {
      if (el.hasAttribute && el.hasAttribute(a)) {
        try { node.setAttribute(a, el.getAttribute(a)); } catch (_) {}
      }
    }
    if (tag === 'IMG' || tag === 'IFRAME' || tag === 'OBJECT') node.setAttribute('alt', '');
    registerStyle(node, el, cs, parentCS, tag, true);
    return node;
  }

  /* --- 태그별 처리 --- */

  function copyAttrs(el, node, outTag) {
    for (const a of el.attributes) {
      const n = a.name.toLowerCase();
      if (n === 'style' || n === 'class' || n === 'srcset' || n === 'sizes' || n === 'loading') continue;
      if (n === 'integrity' || n === 'nonce' || n === 'crossorigin' || n === 'referrerpolicy') continue;
      if (n.startsWith('on')) continue;
      if (outTag === 'img' && (n === 'src' || n === 'poster' || n === 'width' || n === 'height')) continue;
      try { node.setAttribute(a.name, a.value); } catch (_) { /* 잘못된 속성명 */ }
    }
    if (el.tagName === 'A' && el.href) { try { node.setAttribute('href', el.href); } catch (_) {} }

    if (opts.freeze) {
      // 눌렀을 때 어딘가로 가거나 값이 바뀌는 통로를 전부 막는다.
      // disabled 를 붙이면 UA 가 회색으로 칠해 버리므로 쓰지 않는다.
      // 보이는 모습은 원본 그대로고, 동작만 사라진다.
      for (const a of ['href', 'target', 'download', 'ping', 'action', 'formaction',
                       'contenteditable', 'draggable']) node.removeAttribute(a);
      const t = el.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') node.setAttribute('readonly', '');
    }
  }

  function specialize(el, node, cs, rect, clip) {
    const tag = el.tagName;

    if (tag === 'IMG') {
      const src = el.currentSrc || el.src;
      if (!opts.images || !src) { node.removeAttribute('src'); node.setAttribute('alt', ''); return; }
      jobs.push(async () => {
        const d = await toDataURL(src);
        if (d) { node.setAttribute('src', d); stats.images++; }
        // 못 담은 건 조용히 사라지게 두지 않는다. 결과 카드가 개수를 알려준다.
        else { node.removeAttribute('src'); node.setAttribute('alt', ''); stats.imagesFailed++; }
      });
      return;
    }

    if (tag === 'CANVAS') {
      try { node.setAttribute('src', el.toDataURL('image/png')); stats.images++; }
      catch (_) { node.removeAttribute('src'); node.setAttribute('alt', ''); }
      return;
    }

    if (tag === 'VIDEO') {
      // 지금 재생 중인 프레임을 그대로 굳힌다. 교차 출처면 poster 로 대체.
      let done = false;
      try {
        if (el.videoWidth) {
          const c = document.createElement('canvas');
          c.width = el.videoWidth; c.height = el.videoHeight;
          c.getContext('2d').drawImage(el, 0, 0);
          node.setAttribute('src', c.toDataURL('image/png'));
          stats.images++; done = true;
        }
      } catch (_) {}
      if (!done && el.poster) {
        jobs.push(async () => {
          const d = await toDataURL(el.poster);
          if (d) { node.setAttribute('src', d); stats.images++; }
        });
      }
      return;
    }

    if (tag === 'INPUT') {
      const t = (el.type || '').toLowerCase();
      if (t === 'checkbox' || t === 'radio') {
        if (el.checked) node.setAttribute('checked', ''); else node.removeAttribute('checked');
      } else if (t !== 'password' && t !== 'file') {
        node.setAttribute('value', el.value);
      } else {
        node.removeAttribute('value');
      }
      return;
    }

    if (tag === 'TEXTAREA') { node.textContent = el.value; return; }

    if (tag === 'SELECT') {
      // <option> 은 자체 렌더 박스가 없어 가시성 판정에서 걸러진다.
      // 셀렉트가 보이는 경우에만 항목 텍스트를 되살린다.
      // specialize() 시점에는 아직 자식이 붙기 전이라, 반드시 뒤로 미뤄서 실행해야 한다.
      jobs.push(async () => {
        const opsIn = el.options, opsOut = node.querySelectorAll('option');
        for (let i = 0; i < opsOut.length; i++) {
          if (!opsIn[i]) continue;
          if (!opsOut[i].textContent) opsOut[i].textContent = opsIn[i].text;
          if (opsIn[i].selected) opsOut[i].setAttribute('selected', '');
          else opsOut[i].removeAttribute('selected');
        }
      });
      return;
    }

    if (tag === 'IFRAME') {
      node.removeAttribute('src');
      node.setAttribute('sandbox', 'allow-same-origin');
      let inner = null;
      try { inner = opts.frames && depth < 3 ? el.contentWindow : null; if (inner) void inner.document; }
      catch (_) { inner = null; }
      if (inner) {
        jobs.push(async () => {
          try {
            const sub = await captureDocument(inner, opts, depth + 1);
            node.setAttribute('srcdoc', sub.html);
            stats.frames++;
            for (const k of ['kept', 'shells', 'dropped', 'images', 'imagesFailed', 'fonts', 'overlays', 'frames']) {
              stats[k] += sub.stats[k] || 0;
            }
          } catch (_) { /* 실패하면 빈 프레임 */ }
        });
      }
      return;
    }
  }

  // SVG 는 통째로 복제하므로 자손이 스타일 diff 를 못 거친다. 클래스로 색을 주는
  // 로고가 기본 검정으로 나오는 자리다. 칠에 관여하는 속성만 부모와 비교해 옮긴다.
  const SVG_PAINT = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
    'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
    'opacity', 'display', 'visibility'];

  function paintSvgDescendants(srcRoot, dstRoot, rootCS) {
    let src, dst;
    try {
      src = srcRoot.querySelectorAll('*');
      dst = dstRoot.querySelectorAll('*');
    } catch (_) { return; }
    if (src.length !== dst.length) return;          // 구조가 어긋나면 건드리지 않는다
    for (let i = 0; i < src.length; i++) {
      let scs, pcs;
      try {
        scs = gcs(src[i]);
        pcs = src[i].parentElement ? gcs(src[i].parentElement) : rootCS;
      } catch (_) { continue; }
      const parts = [];
      for (const p of SVG_PAINT) {
        const v = scs.getPropertyValue(p);
        if (v && v !== pcs.getPropertyValue(p)) parts.push(p + ':' + v);
      }
      if (parts.length) styleTargets.push({ node: dst[i], parts });
    }
  }

  async function inlineSvgRefs(root) {
    const nodes = root.querySelectorAll('image, use, [href], [*|href]');
    await Promise.all(Array.from(nodes).map(async (n) => {
      const href = n.getAttribute('href') || n.getAttribute('xlink:href');
      if (!href || href.startsWith('#') || href.startsWith('data:')) return;
      let abs; try { abs = new URL(href, doc.baseURI).href; } catch (_) { return; }
      const d = await toDataURL(abs);
      if (!d) return;
      if (n.hasAttribute('href')) n.setAttribute('href', d);
      if (n.hasAttribute('xlink:href')) n.setAttribute('xlink:href', d);
    }));
  }

  /* --- @font-face 수집 --- */

  function normFamily(f) {
    return f.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  }

  function normWeight(w) {
    const v = String(w || '').trim().split(/\s+/)[0].toLowerCase();
    if (v === 'normal' || v === '') return '400';
    if (v === 'bold') return '700';
    return v;
  }

  // usedFamilies 는 font-family '스택'에서 긁은 이름이라 폴백까지 들어 있다.
  // 그대로 쓰면 화면에 한 번도 안 그려진 웹폰트가 통째로 파일에 실린다.
  // 실제로 로드된 face 목록이 있으면 그쪽을 기준으로 삼는다.
  function loadedFaceKeys() {
    const keys = new Set();
    try {
      for (const f of doc.fonts) {
        if (f.status !== 'loaded') continue;
        keys.add([normFamily(f.family), normWeight(f.weight),
                  (f.style || 'normal').trim().toLowerCase(),
                  (f.unicodeRange || '').replace(/\s+/g, '')].join('|'));
      }
    } catch (_) { /* 접근 불가 */ }
    return keys;
  }

  async function collectFontFaces() {
    if (!opts.fonts) return [];
    const loaded = loadedFaceKeys();
    const rules = [];
    const sheets = Array.from(doc.styleSheets);
    for (const sheet of sheets) {
      let cssRules = null;
      try { cssRules = sheet.cssRules; } catch (_) { cssRules = null; }
      if (!cssRules && sheet.href) {
        const r = await ask({ type: 'VSNAP_FETCH_TEXT', url: sheet.href });
        if (r && r.text) {
          try {
            const s = new CSSStyleSheet();
            s.replaceSync(r.text);
            cssRules = s.cssRules;
          } catch (_) { cssRules = null; }
        }
      }
      if (!cssRules) continue;
      walkRules(cssRules, (rule) => {
        if (rule.constructor.name !== 'CSSFontFaceRule' && rule.type !== 5) return;
        const fam = rule.style.getPropertyValue('font-family');
        if (!fam) return;
        const name = normFamily(fam);
        const key = [name, normWeight(rule.style.getPropertyValue('font-weight')),
                     (rule.style.getPropertyValue('font-style') || 'normal').trim().toLowerCase(),
                     (rule.style.getPropertyValue('unicode-range') || '').replace(/\s+/g, '')].join('|');
        const keep = loaded.size ? loaded.has(key) : usedFamilies.has(name);
        if (!keep) return;
        rules.push({ rule, base: sheet.href || doc.baseURI });
      });
    }
    const outCss = [];
    await Promise.all(rules.map(async ({ rule, base }) => {
      const src = rule.style.getPropertyValue('src');
      if (!src) return;
      const cand = [];
      src.replace(URL_RE, (m, q, u) => { cand.push(u); return m; });
      // woff2 우선, 없으면 첫 번째.
      const pick = cand.find((u) => /\.woff2(\?|#|$)/i.test(u)) || cand[0];
      if (!pick) return;
      let abs; try { abs = new URL(pick, base).href; } catch (_) { return; }
      const d = await toDataURL(abs);
      if (!d) return;
      stats.fonts++;
      const decls = [];
      for (let i = 0; i < rule.style.length; i++) {
        const p = rule.style.item(i);
        if (p === 'src') continue;
        decls.push(p + ':' + rule.style.getPropertyValue(p));
      }
      decls.push('src:url("' + d + '")');
      outCss.push('@font-face{' + decls.join(';') + '}');
    }));
    return outCss;
  }

  function walkRules(list, fn) {
    for (const rule of list) {
      fn(rule);
      if (rule.cssRules) { try { walkRules(rule.cssRules, fn); } catch (_) {} }
    }
  }

  /* --- 실행 --- */

  const htmlEl = doc.documentElement;
  const htmlCS = gcs(htmlEl);
  const rootOut = out.createElement('html');
  for (const a of htmlEl.attributes) {
    if (a.name === 'style' || a.name === 'class') continue;
    try { rootOut.setAttribute(a.name, a.value); } catch (_) {}
  }
  registerStyle(rootOut, htmlEl, htmlCS, null, 'HTML', false);

  const headOut = out.createElement('head');
  rootOut.appendChild(headOut);

  const bodyOut = (doc.body && build(doc.body, htmlCS, SCOPE, SCOPE, false, false)) || out.createElement('body');
  rootOut.appendChild(bodyOut);

  // 리소스 작업은 여기서 한꺼번에 (동시 실행 수 제한)
  await runPool(jobs, 10);
  const fontCss = await collectFontFaces();

  /* --- 스타일시트 조립: 같은 선언 묶음은 클래스 하나로 --- */

  const classOf = new Map();
  const cssRules = [];
  function classFor(parts) {
    const text = parts.join(';');
    let c = classOf.get(text);
    if (!c) { c = 'v' + classOf.size.toString(36); classOf.set(text, c); cssRules.push('.' + c + '{' + text + '}'); }
    return c;
  }
  for (const { node, parts } of styleTargets) {
    if (!parts.length) continue;
    node.setAttribute('class', classFor(parts));
  }
  let pi = 0;
  for (const { node, before, after } of pseudoTargets) {
    const c = 'p' + (pi++).toString(36);
    node.setAttribute('class', (node.getAttribute('class') || '') + ' ' + c);
    if (before) cssRules.push('.' + c + '::before{' + before.join(';') + '}');
    if (after) cssRules.push('.' + c + '::after{' + after.join(';') + '}');
  }

  const head = [];
  head.push('<meta charset="utf-8">');
  head.push('<title>' + esc(doc.title || doc.location.href) + '</title>');
  // content:"</style><script>…" 같은 선언이 저장 파일에서 style 을 끊고
  // 뒤를 마크업으로 만들 수 있다. '원본 스크립트는 빠진다'는 약속이 깨지는 자리다.
  const styleText = (fontCss.join('\n') + '\n' + cropCss(win, opts, depth) + '\n' +
    cssRules.join('\n')).replace(/<\/(?=style|script)/gi, '<\\/');
  head.push('<style>' + styleText + '</style>');
  headOut.innerHTML = head.join('\n');

  let tail = '';
  if (!opts.freeze && opts.restoreScroll && (scrollTargets.length || (opts.crop && depth === 0))) {
    const sx = Math.round(win.scrollX), sy = Math.round(win.scrollY);
    // 위쪽 껍데기들의 높이가 원본과 몇 px 씩 어긋날 수 있으므로, 기준점을 하나만 믿지 않고
    // 면적이 큰 (= 눈에 띄는) 블록 여러 개를 심어두고 복원할 때 오차의 중앙값만큼 보정한다.
    anchors.sort((a, b) => b.area - a.area);
    for (const a of anchors.slice(0, 5)) a.node.setAttribute('data-vsa', a.top.toFixed(1));
    tail = '<script>(function(){try{' +
      'document.querySelectorAll("[data-vsc]").forEach(function(e){' +
      'var p=e.getAttribute("data-vsc").split(",");e.scrollLeft=+p[0];e.scrollTop=+p[1];});' +
      'window.scrollTo(' + sx + ',' + sy + ');' +
      // 뷰포트 위쪽 껍데기들의 높이가 원본과 몇 px 어긋나도 화면이 밀리지 않도록,
      // 원본에서 잰 좌표에 앵커를 다시 맞춘다.
      'var A=[].slice.call(document.querySelectorAll("[data-vsa]"));' +
      'for(var i=0;i<4&&A.length;i++){' +
      'var ds=A.map(function(e){return e.getBoundingClientRect().top-parseFloat(e.getAttribute("data-vsa"));})' +
      '.sort(function(x,y){return x-y;});var d=ds[ds.length>>1];' +
      'if(Math.abs(d)<0.5)break;window.scrollBy(0,d);}' +
      (opts.crop && depth === 0
        ? 'document.documentElement.style.setProperty("overflow","hidden","important");'
        : '') +
      '}catch(_){}})();<\/script>';
  }
  if (tail) bodyOut.insertAdjacentHTML('beforeend', tail);

  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
    ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  const banner = '<!-- Capture to HTML | ' + doc.location.href +
    ' | ' + win.innerWidth + '\u00d7' + win.innerHeight +
    (win.scrollY ? ' @' + Math.round(win.scrollY) : '') +
    ' | ' + stamp + ' -->';

  return { html: '<!DOCTYPE html>\n' + banner + '\n' + rootOut.outerHTML, stats };
}

/* ---------- 보조 ---------- */

// 스크립트 없이 뷰포트만 잘라내기. 문서 자체를 스크롤한 만큼 끌어올린 뒤 넘치는 부분을 감춘다.
// position:fixed 요소는 뷰포트 기준이라 이 이동에 휩쓸리지 않고 제자리에 남는다.
function cropCss(win, opts, depth) {
  if (depth !== 0 || !opts.crop) return '';
  if (!opts.freeze && opts.restoreScroll) return '';   // 이 경우는 복원 스크립트가 맡는다
  const sx = Math.round(win.scrollX), sy = Math.round(win.scrollY);
  return 'html{overflow:hidden!important;' +
    (sy ? 'margin-top:' + -sy + 'px!important;' : '') +
    (sx ? 'margin-left:' + -sx + 'px!important;' : '') + '}';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function runPool(jobs, limit) {
  let i = 0;
  const workers = new Array(Math.min(limit, jobs.length || 1)).fill(0).map(async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      try { await j(); } catch (_) {}
    }
  });
  await Promise.all(workers);
  // 작업 중에 새 작업이 추가됐다면(중첩 iframe 등) 한 번 더 훑는다.
  if (i < jobs.length) await runPool(jobs.slice(i), limit);
}

function filename(title) {
  const t = (title || 'page').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 80) || 'page';
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  return t + '_' + stamp + '.html';
}

function download(html, name) {
  const blob = new Blob(['﻿', html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

let busy = false;

function msg(key, fallback) {
  try { return chrome.i18n.getMessage(key) || fallback; } catch (_) { return fallback; }
}

async function main(opts) {
  // 같은 탭에서 두 번 겹쳐 돌면 샌드박스와 캐시가 서로를 덮어쓴다.
  if (busy) return { ok: false, error: msg('errBusy', '이미 저장하는 중이에요.') };
  busy = true;
  const t0 = performance.now();
  openSandbox();
  try {
    const { html, stats } = await Promise.race([
      captureDocument(window, opts, 0),
      new Promise((_, rej) => setTimeout(() => rej(new Error('capture timed out')), 60000)),
    ]);
    const name = filename(document.title);
    download(html, name);
    return {
      ok: true,
      name,
      bytes: new Blob([html]).size,
      ms: Math.round(performance.now() - t0),
      stats,
    };
  } finally {
    closeSandbox();
    resCache.clear();
    busy = false;
  }
}
})();
