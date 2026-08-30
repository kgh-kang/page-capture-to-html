# 개인정보처리방침 · Privacy Policy

**Capture to HTML** (크롬 확장 프로그램)
최종 수정: 2026년 8월 30일

---

## 한국어

### 수집하는 정보

**없습니다.** 이 확장은 어떤 개인정보도 수집·저장·전송하지 않습니다.

- 분석 도구, 추적기, 원격 로깅을 사용하지 않습니다.
- 개발자를 포함해 어떤 서버로도 데이터를 보내지 않습니다.
- 확장에 계정이나 로그인이 없습니다.

### 확장이 하는 일

버튼을 누르면 확장은 **그 순간 열려 있는 탭 하나**를 읽어 HTML 파일을 만들고,
브라우저의 다운로드 폴더에 저장합니다. 모든 처리는 사용자의 컴퓨터 안에서 끝납니다.

파일을 만들 때, 그 페이지가 참조하는 이미지와 글꼴을 파일 안에 담기 위해
해당 리소스가 있는 주소로 요청을 보냅니다. 이 요청은 **사용자의 브라우저에서 원래
페이지가 보내던 것과 같은 요청**이며, 받아온 데이터는 저장 파일에 들어갈 뿐
다른 어디로도 전송되지 않습니다.

### 권한을 쓰는 이유

| 권한 | 쓰는 이유 |
|---|---|
| `activeTab` | 사용자가 버튼이나 단축키로 저장을 요청한 그 탭에만 접근합니다 |
| `scripting` | 그 탭에서 화면을 읽어 HTML 로 옮기는 코드를 실행합니다 |
| `storage` | 사용자가 고른 옵션(예: "사진 넣기")을 브라우저에 로컬 저장합니다. 동기화하지 않습니다 |
| `<all_urls>` | 페이지가 참조하는 이미지·글꼴을 파일에 담기 위해 그 리소스 주소로 요청합니다. 어떤 도메인이 나올지 미리 알 수 없어 넓은 범위가 필요합니다 |

### 저장한 파일에 대한 주의

저장된 HTML 파일에는 **캡처 당시 화면에 있던 내용이 그대로** 담깁니다.
로그인해야 보이는 이미지나 개인적인 내용도 포함될 수 있습니다.
파일을 다른 사람에게 보내기 전에 내용을 확인해 주세요.

### 문의

https://github.com/kgh-kang/page-capture-to-html/issues

---

## English

### What we collect

**Nothing.** This extension does not collect, store, or transmit any personal data.

- No analytics, no trackers, no remote logging.
- No data is sent to any server, including the developer's.
- There is no account or sign-in.

### What the extension does

When you press the button, the extension reads **the single tab you have open at that
moment**, builds an HTML file, and saves it to your browser's download folder.
All processing happens on your own computer.

While building the file, it requests the images and fonts that the page references so
they can be embedded. These are **the same requests your browser was already making for
that page**; the data goes into the saved file and nowhere else.

### Why each permission is needed

| Permission | Why |
|---|---|
| `activeTab` | Access is limited to the tab where you asked for a capture |
| `scripting` | Runs the code that reads the screen and turns it into HTML |
| `storage` | Keeps your option choices locally in the browser. Not synced |
| `<all_urls>` | Fetches the images and fonts the page references so they can be embedded. Those live on domains that cannot be known in advance |

### A note about saved files

A saved file contains **exactly what was on screen** when you captured it, which may
include images or content that are only visible while you are signed in.
Please review a file before sharing it with anyone.

### Contact

https://github.com/kgh-kang/page-capture-to-html/issues
