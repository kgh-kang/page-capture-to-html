"""스크린샷 템플릿에 심을 Pretendard 서브셋을 만든다.

    python3 scripts/subset_font.py <원본.woff2>

원본(Pretendard Variable, 2MB)은 저장소에 두지 않는다. 필요한 글자만 남기면
436KB 로 줄고, 템플릿에 통째로 인라인해도 부담이 없다.
글자 범위는 KS X 1001 상용 한글 2350자 + 라틴 + 한글 자모 + 문장부호.
문구를 고쳐 쓸 여지를 남기려고 실제 사용 글자보다 넉넉하게 잡았다.
"""
import sys, pathlib
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

src = sys.argv[1] if len(sys.argv) > 1 else None
if not src:
    sys.exit('원본 woff2 경로를 주세요 — https://github.com/orioncactus/pretendard 릴리스')

# euc-kr 로 인코딩되는 것만 고르면 CP949(11172자) 가 다 통과한다.
# KS X 1001 한글 영역은 이중바이트 0xB0A1~0xC8FE 라 첫 바이트로 걸러야 2350자가 나온다.
ks = {cp for cp in range(0xAC00, 0xD7A4)
      if (b := chr(cp).encode('euc-kr', errors='ignore')) and len(b) == 2 and 0xB0 <= b[0] <= 0xC8}

uni = set(range(0x20, 0x7F)) | ks | set(range(0x3130, 0x3190))
uni |= {0x00B7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x00D7, 0x2190, 0x2192, 0x27F3}

font = TTFont(src)
opts = Options()
opts.layout_features = ['*']
opts.notdef_outline = True
sub = Subsetter(options=opts)
sub.populate(unicodes=uni)
sub.subset(font)
font.flavor = 'woff2'

out = pathlib.Path('store/shots/pretendard-kr.woff2')
font.save(out)
print(f'{out} · {out.stat().st_size // 1024}KB · {len(uni)}자')
