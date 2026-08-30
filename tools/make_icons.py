"""Capture to HTML — 아이콘 생성기.

애플 아이콘 문법을 따른다.
  · 모서리는 원호가 아니라 연속 곡률(초타원 n=5)
  · 배경은 위가 밝고 아래로 어두워지는 수직 그라데이션 + 상단 광택
  · 심볼은 흰색 하나, 여백을 넉넉히

심볼은 '잘라내기 표시가 HTML 을 겨눈다'. 네 모서리 브래킷은 캡처의 보편 기호이고,
그 안에 든 글자가 무엇을 잡아내는지 말한다.
크기마다 다르게 그린다 — 32px 아래에서는 네 글자가 뭉개지므로 H 한 글자로 바꾼다.

글자는 획으로 흉내내지 않고 Pretendard Bold 를 렌더한 마스크(tools/masks/mask-*.png)를 쓴다.
마스크는 test/render_text.mjs 로 다시 뽑을 수 있다.

사용법:  python3 scripts/make_icons.py [색] [출력폴더]
"""
import zlib, struct, sys, os

WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)

# 애플 시스템 컬러 계열. (위, 아래) 그라데이션.
GRADIENTS = {
    'blue':     ((10, 132, 255), (6, 80, 190)),
    'indigo':   ((94, 92, 230),  (58, 56, 164)),
    'graphite': ((72, 74, 80),   (28, 28, 32)),
    'orange':   ((255, 159, 10), (232, 90, 10)),
    'teal':     ((48, 176, 199), (12, 110, 132)),
    'navy':     ((52, 86, 150),  (20, 38, 76)),
}

def _squircle(gx, gy, n=5.0):
    u, v = (gx - 8) / 8.0, (gy - 8) / 8.0
    return abs(u) ** n + abs(v) ** n <= 1.0

def _seg(px, py, ax, ay, bx, by, w):
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0 if l2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
    cx, cy = ax + t * dx, ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2 <= (w / 2) ** 2

def _lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def _box(gx, gy, x0, y0, x1, y1):
    return x0 <= gx < x1 and y0 <= gy < y1

def _rrect(gx, gy, x0, y0, x1, y1, r):
    if not _box(gx, gy, x0, y0, x1, y1):
        return False
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        if (gx < x0 + r or gx > x1 - r) and (gy < y0 + r or gy > y1 - r):
            if abs(gx - cx) <= r and abs(gy - cy) <= r:
                return (gx - cx) ** 2 + (gy - cy) ** 2 <= r * r
    return True

def _corners(gx, gy, L, T, R, B, t, arm):
    """네 모서리 ㄱ자. 가로팔과 세로팔을 각각 그린다."""
    if _box(gx, gy, L, T, L + arm, T + t) or _box(gx, gy, L, T, L + t, T + arm): return True
    if _box(gx, gy, R - arm, T, R, T + t) or _box(gx, gy, R - t, T, R, T + arm): return True
    if _box(gx, gy, L, B - t, L + arm, B) or _box(gx, gy, L, B - arm, L + t, B): return True
    if _box(gx, gy, R - arm, B - t, R, B) or _box(gx, gy, R - t, B - arm, R, B): return True
    return False

_MASKS = {}

def _read_png_alpha(path):
    """PNG 를 읽어 알파 채널만 꺼낸다. 잉크가 있는 영역으로 잘라서 돌려준다."""
    d = open(path, 'rb').read()
    i, idat, w, h = 8, b'', None, None
    while i < len(d):
        ln = struct.unpack('>I', d[i:i + 4])[0]
        tag, body = d[i + 4:i + 8], d[i + 8:i + 8 + ln]
        if tag == b'IHDR':
            w, h = struct.unpack('>II', body[:8])
        elif tag == b'IDAT':
            idat += body
        i += 12 + ln
    raw = zlib.decompress(idat)
    stride, prev, pos, rows = w * 4, bytearray(w * 4), 0, []
    for _ in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for k in range(4, stride): line[k] = (line[k] + line[k - 4]) & 255
        elif f == 2:
            for k in range(stride): line[k] = (line[k] + prev[k]) & 255
        elif f == 3:
            for k in range(stride):
                line[k] = (line[k] + ((line[k - 4] if k >= 4 else 0) + prev[k]) // 2) & 255
        elif f == 4:
            for k in range(stride):
                a = line[k - 4] if k >= 4 else 0
                b = prev[k]; c = prev[k - 4] if k >= 4 else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[k] = (line[k] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line)); prev = line
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        r = rows[y]
        for x in range(w):
            if r[x * 4 + 3] > 8:
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    alpha = [bytes(rows[y0 + y][(x0 + x) * 4 + 3] for x in range(cw)) for y in range(ch)]
    return cw, ch, alpha

def _mask(name):
    if name not in _MASKS:
        here = os.path.dirname(os.path.abspath(__file__))
        _MASKS[name] = _read_png_alpha(os.path.join(here, 'masks', name + '.png'))
    return _MASKS[name]

def _mask_at(name, gx, gy, cx, cy, height):
    """마스크를 (cx,cy) 중심, 주어진 높이로 놓았을 때 이 지점의 잉크 농도(0..1)."""
    mw, mh, alpha = _mask(name)
    w = height * mw / float(mh)
    u = (gx - (cx - w / 2)) / w
    v = (gy - (cy - height / 2)) / height
    if u < 0 or u >= 1 or v < 0 or v >= 1:
        return 0.0
    return alpha[int(v * mh)][int(u * mw)] / 255.0

def _tri(gx, gy, ax, ay, bx, by, cx, cy):
    def sign(px, py, qx, qy, rx, ry):
        return (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
    d1, d2, d3 = sign(gx, gy, ax, ay, bx, by), sign(gx, gy, bx, by, cx, cy), sign(gx, gy, cx, cy, ax, ay)
    return not (((d1 < 0) or (d2 < 0) or (d3 < 0)) and ((d1 > 0) or (d2 > 0) or (d3 > 0)))

# 대문자 글리프 — x0 부터 폭 w, y0 부터 높이 h, 획 두께 t
def _H(gx, gy, x0, y0, w, h, t):
    return (_box(gx, gy, x0, y0, x0 + t, y0 + h) or _box(gx, gy, x0 + w - t, y0, x0 + w, y0 + h)
            or _box(gx, gy, x0, y0 + h / 2 - t / 2, x0 + w, y0 + h / 2 + t / 2))

def _T(gx, gy, x0, y0, w, h, t):
    return _box(gx, gy, x0, y0, x0 + w, y0 + t) or _box(gx, gy, x0 + w / 2 - t / 2, y0, x0 + w / 2 + t / 2, y0 + h)

def _M(gx, gy, x0, y0, w, h, t):
    if _box(gx, gy, x0, y0, x0 + t, y0 + h) or _box(gx, gy, x0 + w - t, y0, x0 + w, y0 + h):
        return True
    if gy < y0 + h * 0.66:
        if _tri(gx, gy, x0 + t * .2, y0, x0 + t * 1.2, y0, x0 + w / 2 + t / 2, y0 + h * .62): return True
        if _tri(gx, gy, x0 + w - t * 1.2, y0, x0 + w - t * .2, y0, x0 + w / 2 - t / 2, y0 + h * .62): return True
    return False

def _L(gx, gy, x0, y0, w, h, t):
    return _box(gx, gy, x0, y0, x0 + t, y0 + h) or _box(gx, gy, x0, y0 + h - t, x0 + w, y0 + h)

def _word(gx, gy, cx, cy, total_w, h, t, gap):
    w = (total_w - gap * 3) / 4.0
    x, y = cx - total_w / 2, cy - h / 2
    for i, fn in enumerate((_H, _T, _M, _L)):
        if fn(gx, gy, x + i * (w + gap), y, w, h, t):
            return True
    return False

def painter(top, bottom):
    def paint(x, y, s):
        u = s / 16.0
        gx, gy = x / u, y / u
        if not _squircle(gx, gy):
            return CLEAR
        small = s <= 20
        base = _lerp(top, bottom, min(1.0, max(0.0, gy / 16.0)))
        if not small:                                  # 상단 광택은 큰 크기에서만 의미가 있다
            h = max(0.0, 1.0 - gy / 5.5) * 0.10
            base = tuple(round(base[i] + (255 - base[i]) * h) for i in range(3))
        # 브래킷은 가장자리에서 충분히 들여야 한다. 곡선에 붙으면 답답해 보인다.
        # 글자는 이 사각형 '안'에 들어가야 겨누는 그림이 된다 — 넘어가면 그냥 겹친 것이다.
        L, T, R, B = 2.2, 2.2, 13.8, 13.8
        # 네 글자는 32px 아래에서 뭉갠다. 그 크기부터는 H 한 글자로.
        if s <= 40:
            if _corners(gx, gy, L, T, R, B, 1.4 if small else 1.15, 2.6): return WHITE
            ink = _mask_at('mask-h', gx, gy, 8, 8, 4.8 if small else 5.2)
        else:
            if _corners(gx, gy, L, T, R, B, 0.95, 2.5): return WHITE
            ink = _mask_at('mask-html', gx, gy, 8, 8, 2.52)   # 폭 9.2 → 브래킷 안쪽(9.7)에 들어간다
        if ink > 0:
            return tuple(round(base[i] + (255 - base[i]) * ink) for i in range(3)) + (255,)
        return base + (255,)
    return paint

def write_png(path, size, paint, ss=4):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            pr = pg = pb = pa = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    r, g, b, a = paint(x + (sx + .5) / ss, y + (sy + .5) / ss, size)
                    af = a / 255.0
                    pr += r * af; pg += g * af; pb += b * af; pa += af
            n = ss * ss
            row += bytes((0, 0, 0, 0)) if pa < 1e-6 else \
                   bytes((round(pr / pa), round(pg / pa), round(pb / pa), round(pa / n * 255)))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n'
                + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def build(color='navy', outdir='icons', sizes=(16, 32, 48, 128)):
    os.makedirs(outdir, exist_ok=True)
    top, bottom = GRADIENTS[color]
    p = painter(top, bottom)
    for s in sizes:
        write_png(os.path.join(outdir, 'icon%d.png' % s), s, p)
    return outdir

if __name__ == '__main__':
    color = sys.argv[1] if len(sys.argv) > 1 else 'navy'
    out = sys.argv[2] if len(sys.argv) > 2 else 'icons'
    if color not in GRADIENTS:
        sys.exit('색 이름: ' + ', '.join(GRADIENTS))
    print('생성:', build(color, out), '·', color)
