# 우리 캘린더 (Couple Calendar)

두 사람이 각자 일정표 사진을 올리면, 사진 속 일정을 읽어 하나의 공유 캘린더에 색으로 구분해 보여주는 커플 캘린더 앱.
웹(GitHub Pages)과 안드로이드·iOS 앱(Capacitor)이 같은 코드를 씁니다.

- 웹에서 보기: https://eunsaebyeog7-svg.github.io/couple-calendar/

## 기능 현황

| 기능 | 상태 |
|------|------|
| 소셜 로그인 (카카오·Google·Apple), 회원 탈퇴 | 완성, Supabase 키 입력하면 동작 |
| 일정 등록·삭제 (나 / 상대 / 함께) | 완성 |
| 기념일: 시작일 D+, 100일 단위·주년 자동 계산, 직접 등록(매년 반복) | 완성 |
| 오늘의 우리: 날짜별 사진 한 장 저장 (긴 변 900px로 줄여 저장) | 완성 |
| 설정 > 위젯: 오늘의 일정 / 기념일 D-day / 오늘의 우리 사진 켜고 끄기 | 완성, 캘린더 상단 오늘 카드에 적용 |
| 휴대폰 홈 화면 위젯 | 아직 없음 (iOS WidgetKit·Android AppWidget 네이티브 작업, 위 설정값을 그대로 사용) |
| 사진에서 일정 읽기 | 화면만, 예시 결과 |
| 커플 연결, 두 기기 동기화 | 아직 없음 — 지금은 이 기기 localStorage(`cc.v1` 키)에만 저장 |

데이터는 `docs/index.html`의 `load()` / `save()` 두 함수만 거치므로, Supabase로 바꿀 때 이 두 곳만 고치면 됩니다.

## 구조

```
docs/                 웹앱 (앱에도 그대로 들어감, GitHub Pages가 여기를 서비스)
  index.html          앱 전체 (화면 + 로그인 + 탈퇴)
  config.js           Supabase 주소/키, 앱 복귀 주소
  privacy.html        개인정보처리방침 (스토어 제출용 URL)
  delete-account.html 계정 삭제 안내 (구글 플레이 제출용 URL)
  vendor/             capacitor.js, supabase.js (npm run vendor 로 갱신)
supabase/schema.sql   DB 설정 (회원 탈퇴 함수)
android/  ios/        Capacitor 네이티브 프로젝트
capacitor.config.json 앱 ID: com.eunsaebyeog.couplecalendar (스토어에 처음 올린 뒤엔 못 바꿈)
```

## 업데이트하는 법

```bash
npm install          # 처음 한 번
npm run sync         # docs/ 변경을 android/ios 에 반영
npm run android      # Android Studio 열기 (빌드·실행)
npm run ios          # Xcode 열기 (Mac에서만)
git add -A && git commit -m "변경 내용" && git push   # 웹은 push 하면 1~2분 뒤 반영
```

## 안드로이드 앱 빌드 (이 컴퓨터)

Android Studio(winget), SDK(cmdline-tools), JDK 21(Temurin)이 설치되어 있고, 환경 변수 `ANDROID_HOME`, `JAVA_HOME`이 잡혀 있어요.
(Android Studio에 들어 있는 Java는 25라서 Gradle이 아직 못 써요. 명령줄 빌드는 JDK 21을 써야 해요.)

```bash
npm run sync
cd android && ./gradlew assembleDebug      # → android/app/build/outputs/apk/debug/app-debug.apk
```

- 폰에 설치: USB로 연결하고 개발자 옵션 > USB 디버깅을 켠 뒤 `adb install android/app/build/outputs/apk/debug/app-debug.apk`,
  또는 apk 파일을 폰으로 보내서 열기.
- 화면 보면서 고치기: `npm run android` 로 Android Studio 를 열고 ▶ 실행 (에뮬레이터나 연결된 폰).
- 스토어 제출용(aab): Android Studio > Build > Generate Signed App Bundle. 서명 키(keystore)는 한 번 만들면 절대 잃어버리면 안 돼요.

## 아이폰 앱, Mac 없이

빌드(컴파일)는 반드시 macOS에서 해야 하지만, 그 macOS가 내 것일 필요는 없어요. 이 저장소는 공개라 GitHub의 macOS 러너가 무료예요.

| 방법 | 비용 | 할 수 있는 것 |
|------|------|--------------|
| **GitHub Actions** (`.github/workflows/build.yml`, 이미 설정됨) | 무료 (공개 저장소) | push 할 때마다 Android apk + 미서명 iOS ipa 생성 |
| **Sideloadly** (Windows 프로그램) + 위 ipa | 무료, Apple ID만 | 내 아이폰에 설치해서 테스트. 7일마다 다시 설치해야 하고 동시 3개 앱까지 |
| **Codemagic** | 월 500분 무료 | 서명·TestFlight·앱스토어 업로드까지 자동. Apple 개발자 계정 필요 |
| **Capawesome Cloud** | 월 $9부터 | Codemagic과 비슷, Capacitor 전용 |
| 클라우드 Mac 대여 (MacinCloud 등) | 월 $20~30 | 진짜 Xcode 를 원격으로 사용 |

테스트는 "GitHub Actions + Sideloadly" 조합이면 돈이 안 들어요. **앱스토어에 올리려면** 어느 방법이든 Apple Developer Program(연 $99) 가입이 필요하고,
그 뒤에는 GitHub Actions 에 서명 단계를 추가하거나 Codemagic 으로 TestFlight 에 올리면 돼요.

Sideloadly 순서: https://sideloadly.io 에서 설치(Microsoft Store 가 아닌 Apple 사이트의 iTunes 필요) → 아이폰 USB 연결 → ipa 끌어다 놓기 → Apple ID 입력 → 아이폰에서 설정 > 일반 > VPN 및 기기 관리 에서 신뢰.

## 로그인 켜기 (한 번만)

1. **Supabase** (https://supabase.com) 에서 프로젝트 생성
   - Settings > API 의 Project URL, anon key 를 `docs/config.js` 에 입력
   - SQL Editor 에서 `supabase/schema.sql` 실행
   - Authentication > URL Configuration > Redirect URLs 에 추가:
     `com.eunsaebyeog.couplecalendar://auth`, `https://eunsaebyeog7-svg.github.io/couple-calendar/`
   - 각 제공자의 Callback URL 은 `https://<프로젝트>.supabase.co/auth/v1/callback`
2. **카카오** (https://developers.kakao.com): 앱 생성 → 카카오 로그인 켜기 → Redirect URI 에 위 Callback URL →
   동의항목에서 닉네임·프로필사진·카카오계정(이메일) 설정 (이메일은 비즈 앱 전환 필요, 개인 개발자도 가능) →
   REST API 키와 Client Secret 을 Supabase > Authentication > Providers > Kakao 에 입력
3. **Google** (Google Cloud Console): OAuth 동의 화면 → OAuth 클라이언트(웹 애플리케이션) 생성,
   승인된 리디렉션 URI 에 위 Callback URL → Client ID/Secret 을 Supabase Google 제공자에 입력
4. **Apple** (Apple Developer, 유료 계정 필요): App ID 에 Sign in with Apple 켜기 → Services ID 생성(Return URL 에 위 Callback URL) →
   Sign in with Apple 키(.p8) 생성 → Supabase Apple 제공자에 Services ID, Team ID, Key ID, 키 입력

## 스토어 규정 대응 현황

| 규정 | 대응 |
|------|------|
| 앱스토어 4.8: 다른 소셜 로그인이 있으면 Apple 로그인 제공 | Apple 로그인 버튼을 같은 크기로 맨 위에 배치 |
| Google 정책: 앱 안 WebView 에서 Google 로그인 금지 | 시스템 브라우저(SFSafariViewController / Custom Tabs)로 로그인 후 앱으로 복귀 |
| 앱스토어 5.1.1(v) / 구글 플레이: 앱 안에서 계정 삭제 | 연결·계정 > 회원 탈퇴 (확인 후 서버에서 즉시 삭제) |
| 구글 플레이: 앱 밖 계정 삭제 안내 URL | `docs/delete-account.html` |
| 개인정보처리방침 URL, 앱 안 링크 | `docs/privacy.html`, 로그인 화면·계정 화면에 링크 |
| iOS 카메라·사진 권한 사유 문구 | Info.plist 에 한국어 문구 |
| 안드로이드: 불필요한 권한 요청 금지 | 인터넷 권한만 사용 (사진은 시스템 선택기·카메라 앱 사용) |
| 구글 플레이 targetSdk 요건 | targetSdk 36 |
| 노치·홈 바 가림 | safe-area 여백 처리 |

## 제출 전에 남은 일

**코드 (심사 거절 사유가 되는 것)**
- [ ] 사진 일정 읽기를 실제 AI 로 연결 (지금은 예시 결과) — 앱스토어 2.1 "완성되지 않은 기능"으로 거절됨
- [ ] 일정 저장·커플 연결을 Supabase 테이블로 (지금은 예시 일정, 새로고침하면 초기화)
- [ ] Apple 로그인 사용자가 탈퇴할 때 Apple 토큰 철회(revoke) 호출 — 서버 함수 필요
- [ ] 앱 아이콘(1024×1024)과 스플래시 이미지: `npx @capacitor/assets generate`

**직접 하셔야 하는 것**
- [ ] `docs/privacy.html`, `docs/delete-account.html` 의 [운영자 이름], [문의 이메일] 채우기
- [ ] Apple Developer Program 가입 (연 $99), Google Play Console 가입 ($25, 1회)
- [ ] 구글 플레이 신규 개인 계정: 테스터 12명 이상이 14일간 비공개 테스트해야 정식 출시 가능
- [ ] 스토어 콘솔 입력: 앱 개인정보 라벨(Apple), 데이터 보안 양식(Google), 연령 등급, 스크린샷
- [ ] iOS 빌드는 Mac + Xcode 필요 (없으면 Codemagic 같은 클라우드 빌드)
- [ ] 안드로이드 빌드는 Android Studio 설치 필요
