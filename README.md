# 우리 캘린더 (Couple Calendar)

두 사람이 각자 일정표 사진을 올리면 AI가 일정을 읽어 하나의 공유 캘린더에 색으로 구분해 보여주는 커플 캘린더 앱.
웹(GitHub Pages)과 안드로이드·iOS 앱(Capacitor)이 같은 코드를 씁니다.

- 웹에서 보기: https://eunsaebyeog7-svg.github.io/couple-calendar/
- 서버 설정 전에는 로그인 대신 **데모 모드**(이 기기에만 저장)로 모든 화면을 둘러볼 수 있어요.

## 기능

| 기능 | 내용 |
|------|------|
| 로그인 | 카카오·Google·Apple, 처음 로그인하면 닉네임 정하기 (실명 대신 표시) |
| 커플 연결 | 내 코드 공유 또는 상대 코드 입력 → 두 캘린더 합침, 실시간 동기화, 연결 끊기 |
| 일정 | 추가·수정·삭제, 하루 종일, 여러 날, 반복(매주/매달/매년), 나 / 함께 |
| 사진으로 추가 | 내 일정표 사진 → AI(Claude)가 일정 후보를 읽음 → 확인한 것만 **내 일정**으로 추가 |
| 기념일 | 시작일 D+, 100일 단위·주년 자동, 직접 등록(매년 반복) |
| 오늘의 우리 | 날짜별 사진 한 장 (커플만 보는 비공개 저장소) |
| 커뮤니티 | 일상·질문·대화, 사진, 댓글/답변, 좋아요, 검색, 내 글, 글 수정, 신고·차단, 이용 규칙 동의 |
| 오늘 카드 / 홈 화면 위젯 | 오늘 일정, 기념일 D-day, 오늘의 우리 사진, 둘 다 비는 주말 추천 (설정에서 켜고 끄기). 안드로이드 홈 화면 위젯 포함 |
| 알림 (앱) | 기념일 하루 전 오전 9시, 일정 있는 날 오전 8시 |
| 화면 | 밝게/어둡게/기기 설정, 글자 크기 3단계 |
| 회원 탈퇴 | 앱 안에서 즉시 삭제, Apple 토큰 철회, 사진 파일 삭제 |

## 구조

```
docs/                     웹앱 (앱에도 그대로 들어감, GitHub Pages가 여기를 서비스)
  index.html              화면 전체
  store.js                데이터 저장소: makeLocal(데모) / makeCloud(Supabase) — 화면은 둘을 똑같이 부름
  config.js               Supabase 주소/키, 앱 복귀 주소
  privacy.html terms.html delete-account.html   스토어 제출용 URL
  vendor/                 capacitor.js, supabase.js (npm run vendor 로 갱신)
supabase/
  schema.sql              DB 전체 (테이블, 접근 권한, 커플 연결 함수, 신고 자동 숨김, 저장소)
  test-schema.mjs         schema.sql 동작 확인 (npm test)
  functions/parse-schedule  사진 → 일정 (Claude)
  functions/delete-account  회원 탈퇴 (Apple 토큰 철회 + 사진 삭제 + 계정 삭제)
android/  ios/            Capacitor 네이티브 프로젝트 (안드로이드 홈 화면 위젯: TodayWidget.java)
assets/                   앱 아이콘·시작 화면 원본 (node assets/make.mjs && npx capacitor-assets generate)
STORE.md                  스토어 제출 안내 (설명 문구, 개인정보 라벨, 연령 등급, 신고 처리)
```

## 서버 켜기 (한 번만)

1. **Supabase** (https://supabase.com) 에서 프로젝트 생성 (지역: Northeast Asia (Seoul) 추천)
   - Settings > API 의 Project URL, anon key 를 `docs/config.js` 에 입력 (service_role 키는 절대 넣지 말 것)
   - SQL Editor 에서 `supabase/schema.sql` 전체 실행
   - Authentication > URL Configuration > Redirect URLs 에 추가:
     `com.eunsaebyeog.couplecalendar://auth`, `https://eunsaebyeog7-svg.github.io/couple-calendar/`
2. **서버 함수** (Supabase CLI: `npm i -g supabase` 또는 `npx supabase`)
   ```bash
   npx supabase login
   npx supabase link --project-ref <프로젝트 ID>
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        # https://console.anthropic.com 에서 발급
   npx supabase functions deploy parse-schedule
   npx supabase functions deploy delete-account
   ```
   사진 한 장 분석 비용은 대략 50~100원 정도로 예상해요 (Claude Opus 5.5 기준, 사진과 일정 수에 따라 다름 — 실제 사용량은 Anthropic 콘솔에서 확인). Anthropic 콘솔에서 월 사용 한도를 걸어 두세요.
   사진 분석 요청이 안전 분류기에 걸리면 서버가 자동으로 다른 모델로 한 번 더 시도해요(`fallbacks: "default"`).
3. **로그인 제공자** — 각 Callback URL 은 `https://<프로젝트>.supabase.co/auth/v1/callback`
   - **카카오** (https://developers.kakao.com): 앱 생성 → 카카오 로그인 켜기 → Redirect URI 등록 → 동의항목(카카오계정 이메일) → REST API 키·Client Secret 을 Supabase > Authentication > Providers > Kakao 에
   - **Google** (Google Cloud Console): OAuth 동의 화면 → OAuth 클라이언트(웹) → 리디렉션 URI 등록 → Client ID/Secret 을 Supabase 에
   - **Apple** (Apple Developer, 유료): App ID 에 Sign in with Apple → Services ID(Return URL 등록) → 키(.p8) 생성 → Supabase Apple 제공자에 입력.
     탈퇴 시 토큰 철회를 위해 같은 값을 서버 함수에도:
     `npx supabase secrets set APPLE_TEAM_ID=... APPLE_KEY_ID=... APPLE_CLIENT_ID=<Services ID> APPLE_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"`

## 신고 처리 (앱스토어 1.2 필수)

- 서로 다른 3명이 신고한 글·댓글은 자동으로 숨겨져요.
- 매일 한 번 Supabase > Table Editor > `reports` 에서 `resolved = false` 를 확인하세요 (24시간 안 검토가 약속이에요).
  - 문제 있는 글: `posts` 에서 `hidden = true` / 문제없으면 숨김 해제
  - 반복 위반자: Authentication > Users 에서 해당 사용자 Ban
  - 확인한 신고는 `resolved = true`

## 업데이트하는 법

```bash
npm install          # 처음 한 번
npm test             # DB 설정 확인 (schema.sql)
npm run sync         # docs/ 변경을 android/ios 에 반영
npm run android      # Android Studio 열기
git add -A && git commit -m "변경 내용" && git push   # 웹은 push 하면 1~2분 뒤 반영, 앱은 CI 가 apk/ipa 생성
```

DB 를 바꿀 때: 이미 운영 중인 프로젝트에는 `schema.sql` 을 다시 통째로 실행하지 말고, 바뀐 부분만 SQL Editor 에서 실행하세요.

## 안드로이드 앱 빌드 (이 컴퓨터)

Android Studio, SDK, JDK 21(Temurin)이 설치되어 있고 `ANDROID_HOME`, `JAVA_HOME`이 잡혀 있어요.
(Android Studio 안의 Java 25는 Gradle이 아직 못 써서, 명령줄 빌드는 JDK 21을 써요.)

```bash
npm run sync
cd android && ./gradlew assembleDebug      # → android/app/build/outputs/apk/debug/app-debug.apk
```

- 폰에 설치: USB 디버깅 켜고 `adb install ...app-debug.apk`, 또는 apk 파일을 폰으로 보내서 열기.
- 홈 화면 위젯: 홈 화면 길게 누르기 → 위젯 → 우리 캘린더 오늘.
- 스토어 제출용(aab)과 서명 키 만들기는 `STORE.md` 참고.

## 아이폰 앱, Mac 없이

| 방법 | 비용 | 할 수 있는 것 |
|------|------|--------------|
| **GitHub Actions** (`.github/workflows/build.yml`, 이미 설정됨) | 무료 (공개 저장소) | push 할 때마다 Android apk + 미서명 iOS ipa 생성 |
| **Sideloadly** (Windows) + 위 ipa | 무료, Apple ID만 | 내 아이폰에 설치해 테스트. 7일마다 다시 설치, 동시 3개 앱까지 |
| **Codemagic** | 월 500분 무료 | 서명·TestFlight·앱스토어 업로드까지 자동 (Apple 개발자 계정 필요) |
| 클라우드 Mac 대여 (MacinCloud 등) | 월 $20~30 | 진짜 Xcode 를 원격으로 사용 |

아이폰 홈 화면 위젯은 Xcode 에서 Widget Extension 대상을 추가해야 해서 Mac(또는 클라우드 Mac)이 필요해요. 데이터는 안드로이드와 같은 `pushWidget()` 값을 쓰면 돼요.

## 스토어 규정 대응

| 규정 | 대응 |
|------|------|
| 앱스토어 4.8: 다른 소셜 로그인이 있으면 Apple 로그인 | Apple 버튼을 같은 크기로 맨 위에 |
| Google: WebView 안 Google 로그인 금지 | 시스템 브라우저로 로그인 후 앱 복귀 |
| 앱스토어 5.1.1(v) / 구글 플레이: 앱 안 계정 삭제 | 설정 > 내 계정 > 회원 탈퇴, Apple 토큰 철회 포함 |
| 구글 플레이: 앱 밖 계정 삭제 URL | `docs/delete-account.html` |
| 개인정보처리방침·이용약관 URL, 앱 안 링크 | 로그인 화면·설정·커뮤니티 규칙에 링크 |
| 개인정보 국외 이전 고지 (개인정보 보호법) | 사진 분석(Anthropic, 미국) 항목을 방침에 명시 |
| 앱스토어 1.2 / 구글 플레이 UGC | 이용 규칙 동의, 금칙어 필터, 신고, 차단, 3건 자동 숨김, 24시간 검토, 닉네임 사용 |
| 앱스토어 2.1 완성도 | 사진 분석 실제 AI 연결, 데모 데이터 없이 동작 |
| iOS 카메라·사진 권한 문구 / 안드로이드 최소 권한 | Info.plist 한국어 문구 / 인터넷·알림 권한만 |
| 구글 플레이 targetSdk | 36 |

## 남은 일 (직접 하셔야 하는 것)

- [ ] `docs/privacy.html`, `docs/terms.html`, `docs/delete-account.html` 의 [운영자 이름], [문의 이메일] 채우기
- [ ] 위 "서버 켜기" 진행 (Supabase, Anthropic API 키, 카카오·Google·Apple)
- [ ] Apple Developer Program (연 $99), Google Play Console ($25, 1회) 가입
- [ ] 구글 플레이 신규 개인 계정: 테스터 12명 이상, 14일 비공개 테스트 후 정식 출시
- [ ] `STORE.md` 대로 스토어 콘솔 입력, 스크린샷 찍기
- [ ] 아이폰 홈 화면 위젯 (Mac 필요, 선택)
