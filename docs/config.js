// 앱 설정. Supabase 프로젝트를 만든 뒤 아래 두 값을 바꾸면 로그인이 켜져요.
// anon key는 공개용 키라 저장소에 올려도 괜찮아요 (데이터 보호는 schema.sql의 RLS가 담당).
// service_role key는 절대 여기에 넣지 마세요.
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
  NATIVE_REDIRECT: "com.eunsaebyeog.couplecalendar://auth",   // 앱 ID와 같아야 함 (capacitor.config.json)
  SITE_URL: "https://eunsaebyeog7-svg.github.io/couple-calendar/",
};
