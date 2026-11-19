# U PLEAT 문의함

upleat.com 문의 폼(Web3Forms)으로 접수된 내역을 모아 보는 내부용 페이지입니다.

- 주소: https://nameofmin-net.github.io/upleat-inquiry/
- 탭: 유플리트 / 세이프유 (Web3Forms 폼 Access Key 기준으로 분리)
- 데이터: Web3Forms Submissions API(`/v1/forms`, `/v1/submissions`)를 브라우저에서 직접 호출
- **API 키·문의 데이터는 이 저장소에 없습니다.** 페이지 접속 시 입력한 API 키는 그 브라우저에만 저장됩니다.

## 사용
1. Web3Forms 대시보드 → Account → API Keys에서 읽기 전용 키 발급 (Pro 플랜 필요)
2. https://nameofmin-net.github.io/upleat-inquiry/ 접속 → 키 입력
3. 검색, 상세 보기(행 클릭), CSV 내보내기

## 설정
- 탭과 폼 연결: `app.js` 상단 `TABS`의 `formId`
- 서브도메인으로 바꾸려면: `CNAME` 파일(예: inquiry.upleat.com) 추가 + DNS(가비아)에 CNAME → `nameofmin-net.github.io`
