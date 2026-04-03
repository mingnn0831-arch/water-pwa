# 💧 물 마시기 알림 PWA

## 배포 전 필수 설정 (5분)

### 1. VAPID 키 생성
```bash
npm install
npx web-push generate-vapid-keys
```
출력된 Public Key / Private Key 를 복사해 둡니다.

### 2. index.html 에 Public Key 입력
```html
<!-- index.html 6번째 줄 -->
<script>window.VAPID_PUBLIC_KEY = '여기에_PUBLIC_KEY_붙여넣기';</script>
```

### 3. Vercel 환경변수 설정
Vercel 대시보드 → Project → Settings → Environment Variables

| 변수명 | 값 |
|---|---|
| `VAPID_PUBLIC_KEY` | 위에서 생성한 Public Key |
| `VAPID_PRIVATE_KEY` | 위에서 생성한 Private Key |
| `VAPID_EMAIL` | 본인 이메일 (예: me@gmail.com) |
| `CRON_SECRET` | 임의 문자열 (예: my-secret-123) |

### 4. Vercel KV 연결
Vercel 대시보드 → Project → Storage → Create Database → KV 선택 → Connect

### 5. 배포
```bash
vercel --prod
```

---

## iOS 홈 화면 추가 방법
1. Safari 에서 앱 URL 열기
2. 하단 공유 버튼(□↑) 탭
3. "홈 화면에 추가" 선택
4. "추가" 탭

iOS 16.4+ 에서 홈 화면 추가 후 백그라운드 알림이 작동합니다.

---

## 파일 구조
```
/
├── index.html          메인 앱
├── style.css           스타일
├── app.js              앱 로직
├── sw.js               서비스 워커
├── manifest.json       PWA 매니페스트
├── vercel.json         Cron 설정 (30분마다)
├── package.json
├── api/
│   ├── subscribe.js    푸시 구독 저장
│   └── send-push.js    Cron 푸시 발송
└── public/
    ├── icon-192.png
    └── icon-512.png
```

## 알림 작동 원리
- Cron Job 이 30분마다 `/api/send-push` 호출
- 서버에서 마지막 발송 시각과 설정된 interval 비교
- 활성 시간(기상~취침) 내에 있을 때만 발송
- 서비스 워커가 push 이벤트 수신 → 알림 표시
