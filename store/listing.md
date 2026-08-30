# 스토어 등록 문안

대시보드에 그대로 붙여 넣을 수 있게 정리한 것.

---

## 간단한 설명 (132자 제한)

**한국어** (39자)
```
지금 화면에 보이는 것만 HTML 파일 하나로 저장합니다.
```

**English** (63자)
```
Saves only what you can see right now as a single HTML file.
```

---

## 자세한 설명

### 한국어

```
보고 있는 화면을 그대로 HTML 파일 하나로 저장합니다. 스크롤 밖 내용, 접힌 메뉴, 팝업에 가려진 글자는 담지 않습니다.

화면을 그대로 남기는 가장 단순한 방법

스크린샷은 글자를 복사할 수 없고, 페이지 저장은 안 보이던 것까지 전부 담습니다.
Capture to HTML 은 버튼을 누른 그 순간 화면에 실제로 그려져 있던 것만 남깁니다.

Capture to HTML 이 해주는 일
· 화면 그대로 보관: 나중에 사라질 페이지를 지금 모습 그대로 파일 하나에 담습니다
· 글자는 살아 있게: 스크린샷과 달리 본문을 그대로 복사하고 검색할 수 있습니다
· 가린 창은 걷어내고: 화면을 덮은 안내창을 치우고 그 아래 내용을 저장합니다
· 인터넷 없이 열기: 이미지와 웹폰트까지 담겨서 파일 하나만 있으면 됩니다

기록을 남겨야 하는 분, 자료를 모으는 분, 곧 사라질 화면을 붙잡아 둬야 하는 분께 맞습니다.

수집하는 정보는 없습니다. 분석 도구도 추적기도 없고, 모든 처리가 브라우저 안에서 끝납니다.
다만 저장한 파일에는 캡처 당시 화면이 그대로 담기니, 남에게 보내기 전에 한 번 확인해 주세요.
```

### English

```
Saves the screen you are looking at as a single HTML file. Off-screen content, collapsed menus, and text hidden behind pop-ups are left out.

The simplest way to keep a screen exactly as it looked

A screenshot will not let you copy the text, and saving a page pulls in everything you could not see.
Capture to HTML keeps only what was actually drawn on screen the moment you pressed the button.

What Capture to HTML does for you
· Keep the screen as it was: Hold on to a page that will not be there tomorrow, in one file
· Text stays text: Unlike a screenshot, you can select, copy and search the words
· Clear what covers it: Take the dialog away and save what was underneath
· Opens without internet: Images and web fonts are embedded, so the file is all you need

Made for people keeping records, collecting references, or holding on to a screen before it disappears.

Nothing is collected. No analytics, no trackers, and everything happens inside your browser.
That said, a saved file holds exactly what was on screen — please review it before sharing.
```

---

## 개인정보 보호 탭

### 단일 목적 (Single purpose)

**한국어**
```
사용자가 보고 있는 웹 페이지 화면을 HTML 파일 하나로 저장합니다.
```

**English**
```
Saves the web page screen the user is looking at as a single HTML file.
```

### 권한별 정당성

**`scripting`**
```
사용자가 툴바 버튼을 누르거나 단축키를 눌렀을 때, 그 탭에서 화면 내용을 읽어 HTML 로
옮기는 코드를 실행합니다. 사용자가 저장을 요청하지 않은 탭에는 코드를 넣지 않습니다.
이 코드는 확장에 함께 포함된 파일이며, 외부에서 내려받지 않습니다.

Runs the code that reads the visible screen and turns it into HTML, in the tab where the
user pressed the toolbar button or the shortcut. No code is injected into tabs the user
did not ask to capture. That code ships inside the extension and is never fetched remotely.
```

**`storage`**
```
사용자가 고른 옵션(예: 이미지를 포함할지)을 브라우저에 로컬로 저장해, 다음에 열었을 때
같은 설정이 유지되게 합니다. 동기화하지 않으며 개인정보를 담지 않습니다.

Stores the user's option choices locally so they persist between uses. Nothing is synced
and no personal data is kept.
```

**`host_permissions: <all_urls>`**
```
저장한 HTML 파일 하나만으로 화면이 재현되려면, 그 페이지가 참조하는 이미지와 웹폰트를
파일 안에 담아야 합니다. 그 리소스들은 페이지와 다른 도메인(이미지 CDN, 폰트 서버)에
있는 경우가 대부분이고, Manifest V3 에서 콘텐츠 스크립트는 교차 출처 요청을 할 수 없어
서비스 워커가 대신 받아옵니다. 사용자가 어떤 페이지를 저장할지 미리 알 수 없으므로
특정 도메인 목록으로 좁힐 수 없습니다.

받아온 데이터는 저장 파일에 embed 될 뿐, 어떤 서버로도 전송되지 않습니다.

To make a saved HTML file self-contained, the images and web fonts a page references
must be embedded in it. Those almost always live on different domains (image CDNs, font
servers). Under Manifest V3 a content script cannot make cross-origin requests, so the
service worker fetches them instead. Since the user may capture any page, the set of
domains cannot be known in advance and cannot be narrowed to a fixed list.

Fetched data is embedded into the saved file and is never sent to any server.
```

### 원격 코드 사용

```
아니요. 모든 코드가 확장 패키지 안에 있습니다. eval, new Function, 외부 스크립트 로드를
사용하지 않습니다.

No. All code ships inside the package. No eval, no new Function, no externally loaded
scripts.
```

### 데이터 사용 공개

수집하는 항목: **없음** (모든 항목 체크 해제)

세 가지 확약 모두 해당:
- 승인된 용도 외에 사용자 데이터를 판매하거나 제3자에게 이전하지 않습니다
- 항목의 단일 목적과 무관한 용도로 사용하거나 이전하지 않습니다
- 신용도 판단이나 대출 목적으로 사용하거나 이전하지 않습니다

개인정보처리방침 URL:

수집 항목을 전부 해제하면 **선택 사항**이라 비워도 된다. 일단 비우고 제출해 보고,
심사에서 요구하면 그때 붙이면 된다 — 저장소는 private 이므로 GitHub 주소를 그대로 쓰면
404 다. 공개가 필요해지면:

```bash
gh gist create PRIVACY.md --public    # 여기서 나온 주소를 입력
```

---

## 제출용 이미지

`dist/store/` 에 있다. `node store/shots/build.mjs ko` / `... en` 으로 다시 만든다.

| 파일 | 규격 | 용도 |
|---|---|---|
| `{ko,en}-01-same.png` | 1280×800 | 원본과 저장본이 같다 |
| `{ko,en}-02-visible.png` | 1280×800 | 보이는 것만 담긴다 |
| `{ko,en}-03-overlay.png` | 1280×800 | 덮은 창을 걷어낸다 |
| `{ko,en}-04-single.png` | 1280×800 | 파일 하나로 끝 |
| `{ko,en}-05-popup.png` | 1280×800 | 팝업 화면 |
| `{ko,en}-tile.png` | 440×280 | 소형 프로모 타일 |

스크린샷은 최소 1장·최대 5장이므로 다섯 장을 그대로 올리면 된다.
언어별로 다른 이미지를 올릴 수 있으니 한국어 항목에는 `ko-`, 영어에는 `en-` 을 쓴다.

## 기타

- **카테고리**: 업무 효율 (Productivity)
- **언어**: 한국어, English
- **배포 범위**: 처음에는 미등록(Unlisted)으로 올려 직접 확인한 뒤 공개로 전환 권장
