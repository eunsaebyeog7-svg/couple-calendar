-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

-- 회원 탈퇴: 로그인한 본인 계정만 지움. (앱스토어 5.1.1(v), 구글 플레이 계정 삭제 정책)
-- auth.users 를 참조하는 테이블은 on delete cascade 로 만들면 함께 지워집니다.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
