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
보고 있는 화면을 그대로 HTML 파일 하나로 저장합니다.

기존 저장 도구는 페이지 전체를 담습니다. 접혀 있는 메뉴, 안 열린 모달, 쓰이지도 않은
템플릿까지 전부요. 그래서 파일을 열면 원래 보던 화면과 다른 것이 나옵니다.

Capture to HTML 은 반대로 갑니다. 버튼을 누른 그 순간 화면에 실제로 그려져 있던 것만
남깁니다. 애니메이션은 그 순간 모습으로 굳고, 스크롤 밖 내용은 비워지고, 팝업에 가려
안 보이던 글자는 저장되지 않습니다.

■ 이런 때 씁니다
· 나중에 사라질 화면을 그대로 남겨두고 싶을 때
· 스크린샷으로는 글자를 복사할 수 없어 아쉬울 때
· 페이지 전체가 아니라 지금 이 부분만 필요할 때

■ 무엇이 담기나
· 화면에 보이던 글자와 이미지 (파일 하나 안에 전부)
· 웹폰트도 함께 담아서 글자 모양이 바뀌지 않습니다
· 입력칸에 쓰던 값, 체크 상태, 선택한 항목까지 그대로

■ 무엇이 빠지나
· 화면 밖에 있던 내용
· 접힌 메뉴, 안 열린 대화상자
· 팝업이나 배너에 덮여 안 보이던 것
· 애니메이션, 마우스 올렸을 때 나오는 효과, 원본 페이지의 스크립트

■ 고를 수 있는 것
· 지금 화면만 / 페이지 전체
· 아무것도 안 눌리게 굳히기 — 링크와 입력을 전부 끊어 읽기 전용 파일로
· 덮은 안내창 치우기 — 화면을 가린 팝업을 걷어내고 그 아래를 저장
· 사진·글꼴을 뺄 수 있어 파일을 가볍게 만들 수도 있습니다

■ 개인정보
아무것도 수집하지 않습니다. 분석 도구도 추적기도 없고, 어떤 서버로도 데이터를 보내지
않습니다. 모든 처리가 사용자의 컴퓨터 안에서 끝납니다.

다만 저장된 파일에는 캡처 당시 화면 내용이 그대로 담깁니다. 로그인해야 보이는 이미지,
그리고 파일 첫 줄 주석에 원래 주소와 저장 시각이 함께 남습니다. 파일을 남에게 보내기
전에 한 번 확인해 주세요.

소스 코드: https://github.com/kgh-kang/page-capture-to-html
```

### English

```
Saves the screen you are looking at as a single HTML file.

Other saving tools capture the whole page — collapsed menus, unopened dialogs, unused
templates and all. Open the result and you get something different from what you were
looking at.

Capture to HTML goes the other way. It keeps only what was actually drawn on screen the
moment you pressed the button. Animations freeze where they were, off-screen content is
emptied out, and text hidden behind a dialog is not saved.

■ When it helps
· Keeping a screen that will not be there later
· When a screenshot is not enough because you need to copy the text
· When you want this part of the page, not the whole thing

■ What goes in
· Every visible word and image, all inside one file
· Web fonts are embedded too, so letterforms do not shift
· Typed values, checkboxes and selections stay as they were

■ What stays out
· Anything off-screen
· Collapsed menus and unopened dialogs
· Text covered by pop-ups or banners
· Animations, hover effects, and the original page scripts

■ Options
· Just this screen / Whole page
· Freeze — cuts every link and input so nothing is clickable
· Remove covering dialogs — takes away the pop-up and saves what was underneath
· Images and fonts can be left out for a much smaller file

■ Privacy
Nothing is collected. No analytics, no trackers, and no data sent to any server.
Everything happens on your own computer.

That said, a saved file holds exactly what was on screen, which can include images that
are only visible while you are signed in. Please review a file before sharing it.

Source code: https://github.com/kgh-kang/page-capture-to-html
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
```
https://github.com/kgh-kang/page-capture-to-html/blob/main/PRIVACY.md
```

---

## 기타

- **카테고리**: 업무 효율 (Productivity)
- **언어**: 한국어, English
- **배포 범위**: 처음에는 미등록(Unlisted)으로 올려 직접 확인한 뒤 공개로 전환 권장
