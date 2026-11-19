# U PLEAT 문의함

upleat.com 문의 폼으로 접수된 내역을 모아 보는 내부용 페이지입니다. (무료 구성)

- 주소: https://nameofmin-net.github.io/upleat-inquiry/
- 탭: 유플리트 / 세이프유
- 흐름: 홈페이지 문의 폼 → Web3Forms(메일 발송) + 구글 시트(Apps Script, 저장) → 이 페이지가 시트를 읽어 표시
- **비밀번호·문의 데이터는 이 저장소에 없습니다.** 원본은 구글 시트, 비밀번호는 Apps Script 스크립트 속성에만 있습니다.

## 설치 (한 번)
1. 새 구글 시트 → 확장 프로그램 → Apps Script → `apps-script/Code.gs` 붙여넣기 → 저장
2. 함수 `setup` 한 번 실행(권한 허용) → '유플리트', '세이프유' 시트 생성
3. 프로젝트 설정 → 스크립트 속성 → `VIEW_PASSWORD` 추가
4. 배포 → 새 배포 → 웹 앱 (실행: 나 / 액세스: 모든 사용자) → `/exec` URL 복사
5. 그 URL을 `app.js`의 `SHEET_API`와 Framer `ContactFormSwitch.tsx`의 `SHEET_API`에 입력

## 사용
- 주소 접속 → 비밀번호 입력 → 검색, 상세 보기(행 클릭), CSV 내보내기
- 시트 자체에서도 바로 보고 정리할 수 있습니다.
