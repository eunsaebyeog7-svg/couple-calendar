# 우리 캘린더 (Couple Calendar)

두 사람이 각자 일정표 사진을 올리면, 사진 속 일정을 읽어 하나의 공유 캘린더에 색으로 구분해 보여주는 커플 캘린더 앱.

- 웹에서 보기: https://eunsaebyeog7-svg.github.io/couple-calendar/

## 현재 상태: 클릭 가능한 초안

| 기능 | 상태 |
|------|------|
| 공유 월간 캘린더 (나 / 상대 / 함께 색 구분, 둘 다 비는 날 표시) | 화면 완성 |
| 사진 업로드 → 일정 추출 → 확인 후 추가 | 화면 완성, 추출은 예시 데이터 |
| 초대 코드로 상대와 연결 | 화면만 |
| 로그인, 저장, 두 사람 간 실시간 동기화 | 아직 없음 |

## 구조

```
index.html   앱 전체 (HTML + CSS + JS 한 파일)
README.md    이 문서
```

## 업데이트하는 법

```bash
git add -A
git commit -m "변경 내용"
git push
```

push 하면 1~2분 뒤 위 웹 주소에 자동 반영됩니다 (GitHub Pages).

## 다음 단계

1. 사진 일정 추출: 이미지 인식 AI(예: Claude API)로 날짜·시간·제목 JSON 받기 — API 키 때문에 서버 함수 필요
2. 로그인 + 커플 연결 + 실시간 공유: Supabase 또는 Firebase
3. 모바일 앱으로 감싸기: PWA 또는 Capacitor
