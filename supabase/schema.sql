-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 한 번 실행하세요. (새 프로젝트 기준)
-- 원칙: 모든 테이블은 RLS 로 막고, 커플 데이터는 같은 커플만, 커뮤니티는 로그인한 사람만 봄.
-- auth.users 를 지우면(회원 탈퇴) on delete cascade 로 그 사람 데이터가 함께 지워짐.

------------------------------------------------------------------ 프로필 (커뮤니티 닉네임)
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 12),
  created_at timestamptz not null default now()
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));

------------------------------------------------------------------ 커플
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  -- 6자리 랜덤 코드. 충돌하면 new_couple() 이 다시 뽑음.
  code text not null unique default upper(substr(md5(random()::text), 1, 3) || '-' || substr(md5(random()::text), 1, 3)),
  start date,
  created_at timestamptz not null default now()
);
create table public.couple_members (
  user_id uuid primary key references auth.users on delete cascade,   -- 한 사람은 한 커플에만
  couple_id uuid not null references public.couples on delete cascade,
  joined_at timestamptz not null default now()
);
create index on public.couple_members (couple_id);

-- 내 커플 id (RLS 에서 재귀 없이 쓰려고 security definer)
create function public.my_couple() returns uuid
language sql stable security definer set search_path = '' as $$
  select couple_id from public.couple_members where user_id = auth.uid()
$$;

------------------------------------------------------------------ 일정 · 기념일 · 오늘의 우리
create table public.events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  shared boolean not null default false,          -- '함께' 일정
  d date not null,
  end_d date,                                     -- 여러 날 일정의 마지막 날
  t time,                                         -- null = 하루 종일
  title text not null check (char_length(title) between 1 and 60),
  rep text not null default 'none' check (rep in ('none','weekly','monthly','yearly')),
  created_at timestamptz not null default now(),
  check (end_d is null or end_d >= d)
);
create index on public.events (couple_id);
create table public.annivs (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  d date not null,
  yearly boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.photos (
  couple_id uuid not null references public.couples on delete cascade,
  d date not null,
  path text not null,                             -- Storage 'photos' 버킷: {업로드한 사람 id}/{파일}
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  primary key (couple_id, d)
);

alter table public.profiles       enable row level security;
alter table public.couples        enable row level security;
alter table public.couple_members enable row level security;
alter table public.events         enable row level security;
alter table public.annivs         enable row level security;
alter table public.photos         enable row level security;

create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "edit profile" on public.profiles for update to authenticated using (id = auth.uid());

create policy "my couple" on public.couples for select to authenticated using (id = public.my_couple());
create policy "edit couple" on public.couples for update to authenticated using (id = public.my_couple());
revoke update on public.couples from authenticated;
grant update (start) on public.couples to authenticated;           -- 코드는 못 바꿈

create policy "my couple members" on public.couple_members for select to authenticated using (couple_id = public.my_couple());
-- 가입·탈퇴는 아래 함수로만 (insert/delete 정책 없음)

create policy "read events" on public.events for select to authenticated using (couple_id = public.my_couple());
create policy "add events" on public.events for insert to authenticated
  with check (couple_id = public.my_couple() and owner = auth.uid());
create policy "edit events" on public.events for update to authenticated
  using (couple_id = public.my_couple() and (owner = auth.uid() or shared))
  with check (couple_id = public.my_couple());
create policy "delete events" on public.events for delete to authenticated
  using (couple_id = public.my_couple() and (owner = auth.uid() or shared));

create policy "couple annivs" on public.annivs for all to authenticated
  using (couple_id = public.my_couple()) with check (couple_id = public.my_couple());

create policy "read photos" on public.photos for select to authenticated using (couple_id = public.my_couple());
create policy "add photos" on public.photos for insert to authenticated
  with check (couple_id = public.my_couple() and owner = auth.uid());
create policy "replace photos" on public.photos for update to authenticated
  using (couple_id = public.my_couple()) with check (couple_id = public.my_couple() and owner = auth.uid());
create policy "delete photos" on public.photos for delete to authenticated using (couple_id = public.my_couple());

-- 새 커플 공간 (코드가 겹치면 다시 뽑기)
create function public.new_couple() returns public.couples
language plpgsql security definer set search_path = '' as $$
declare c public.couples;
begin
  loop
    begin
      insert into public.couples default values returning * into c;
      return c;
    exception when unique_violation then null;
    end;
  end loop;
end $$;
revoke execute on function public.new_couple() from public, anon, authenticated;

-- 처음 로그인하면 혼자 쓰는 커플 공간을 만들어 둠 (상대가 코드로 들어오면 둘이 됨)
create function public.ensure_couple() returns public.couples
language plpgsql security definer set search_path = '' as $$
declare c public.couples;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into c from public.couples where id = public.my_couple();
  if found then return c; end if;
  c := public.new_couple();
  insert into public.couple_members (user_id, couple_id) values (auth.uid(), c.id);
  return c;
end $$;

-- 상대 코드로 연결: 내 공간의 일정·기념일·사진을 상대 공간으로 옮기고 합침
create function public.join_couple(p_code text) returns public.couples
language plpgsql security definer set search_path = '' as $$
declare target public.couples; old uuid := public.my_couple();
begin
  select * into target from public.couples where code = upper(trim(p_code));
  if not found then raise exception 'code_not_found'; end if;
  if target.id = old then raise exception 'own_code'; end if;
  if (select count(*) from public.couple_members where couple_id = target.id) >= 2 then raise exception 'couple_full'; end if;
  -- 이미 연결된 사람이 다른 코드를 넣으면 상대 데이터까지 옮겨지므로 막음 (먼저 연결 끊기)
  if (select count(*) from public.couple_members where couple_id = old) >= 2 then raise exception 'already_linked'; end if;
  if old is not null then
    update public.events set couple_id = target.id where couple_id = old;
    update public.annivs set couple_id = target.id where couple_id = old;
    update public.photos set couple_id = target.id
      where couple_id = old and d not in (select d from public.photos where couple_id = target.id);
    if target.start is null then
      update public.couples set start = (select start from public.couples where id = old) where id = target.id returning * into target;
    end if;
    delete from public.couple_members where user_id = auth.uid();   -- 빈 공간은 아래 트리거가 지움
  end if;
  insert into public.couple_members (user_id, couple_id) values (auth.uid(), target.id);
  return target;
end $$;

-- 연결 끊기: 내가 만든 내 일정만 들고 새 공간으로. 함께 일정·기념일·사진은 상대에게 남음.
create function public.leave_couple() returns public.couples
language plpgsql security definer set search_path = '' as $$
declare old uuid := public.my_couple(); c public.couples;
begin
  if old is null then raise exception 'no_couple'; end if;
  if (select count(*) from public.couple_members where couple_id = old) < 2 then raise exception 'not_linked'; end if;
  c := public.new_couple();
  update public.events set couple_id = c.id where couple_id = old and owner = auth.uid() and not shared;
  update public.couple_members set couple_id = c.id, joined_at = now() where user_id = auth.uid();
  return c;
end $$;

-- 마지막 사람이 나가면(연결 이동·탈퇴) 빈 커플 공간과 남은 데이터 삭제
create function public.drop_empty_couple() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.couples c where c.id = old.couple_id
    and not exists (select 1 from public.couple_members m where m.couple_id = c.id);
  return null;
end $$;
create trigger drop_empty_couple after delete or update of couple_id on public.couple_members
  for each row execute function public.drop_empty_couple();

------------------------------------------------------------------ 커뮤니티
-- 스토어 UGC 규정(App Store 1.2, Google Play UGC 정책): 이용 규칙 동의, 필터, 신고, 차단, 24시간 내 검토.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references public.profiles on delete cascade,
  cat text not null check (cat in ('daily','qna','talk')),
  body text not null check (char_length(body) between 1 and 1000),
  image_path text,                       -- Storage 'community' 버킷
  hidden boolean not null default false, -- 신고 3건 자동 숨김 또는 관리자 숨김
  created_at timestamptz not null default now()
);
create index on public.posts (created_at desc);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  author uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.comments (post_id);
create table public.likes (
  post_id uuid references public.posts on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete cascade,
  primary key (post_id, user_id)
);
create table public.blocks (
  blocker uuid default auth.uid() references auth.users on delete cascade,
  blocked uuid references public.profiles on delete cascade,
  primary key (blocker, blocked)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users on delete cascade,
  post_id uuid references public.posts on delete cascade,
  comment_id uuid references public.comments on delete cascade,
  reason text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1),
  unique (reporter, post_id), unique (reporter, comment_id)
);

alter table public.posts    enable row level security;
alter table public.comments enable row level security;
alter table public.likes    enable row level security;
alter table public.blocks   enable row level security;
alter table public.reports  enable row level security;

create policy "read posts" on public.posts for select to authenticated
  using ((not hidden or author = auth.uid()) and author not in (select blocked from public.blocks where blocker = auth.uid()));
create policy "write posts" on public.posts for insert to authenticated with check (author = auth.uid() and not hidden);
create policy "edit posts" on public.posts for update to authenticated using (author = auth.uid());
create policy "delete posts" on public.posts for delete to authenticated using (author = auth.uid());
revoke update on public.posts from authenticated;
grant update (body, cat, image_path) on public.posts to authenticated;   -- hidden 은 못 바꿈

create policy "read comments" on public.comments for select to authenticated
  using ((not hidden or author = auth.uid()) and author not in (select blocked from public.blocks where blocker = auth.uid()));
create policy "write comments" on public.comments for insert to authenticated with check (author = auth.uid() and not hidden);
create policy "delete comments" on public.comments for delete to authenticated using (author = auth.uid());

create policy "read likes" on public.likes for select to authenticated using (true);
create policy "like" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "unlike" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "own blocks" on public.blocks for all to authenticated
  using (blocker = auth.uid()) with check (blocker = auth.uid());

-- 신고는 넣기만 가능. 확인은 대시보드 Table Editor > reports (README '신고 처리' 참고)
create policy "file report" on public.reports for insert to authenticated with check (reporter = auth.uid());

-- 서로 다른 3명이 신고하면 바로 숨김 (관리자 검토 전 1차 차단)
create function public.auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.post_id is not null and (select count(*) from public.reports where post_id = new.post_id) >= 3 then
    update public.posts set hidden = true where id = new.post_id;
  end if;
  if new.comment_id is not null and (select count(*) from public.reports where comment_id = new.comment_id) >= 3 then
    update public.comments set hidden = true where id = new.comment_id;
  end if;
  return null;
end $$;
create trigger auto_hide after insert on public.reports for each row execute function public.auto_hide();

------------------------------------------------------------------ Apple 로그인 탈퇴 처리용 토큰
-- Apple 은 탈퇴 시 토큰 철회(revoke)를 요구. 로그인 직후 받은 refresh token 을 저장해 두고
-- delete-account 함수(service role)만 읽음. 앱은 아래 함수로 쓰기만 가능.
create table public.apple_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);
alter table public.apple_tokens enable row level security;   -- 정책 없음 = 앱에서 못 읽음
create function public.save_apple_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  insert into public.apple_tokens (user_id, refresh_token) values (auth.uid(), p_token)
  on conflict (user_id) do update set refresh_token = excluded.refresh_token, updated_at = now();
$$;

------------------------------------------------------------------ 함수 권한
revoke execute on function public.ensure_couple(), public.join_couple(text), public.leave_couple(),
  public.save_apple_token(text), public.my_couple() from public, anon;
grant execute on function public.ensure_couple(), public.join_couple(text), public.leave_couple(),
  public.save_apple_token(text), public.my_couple() to authenticated;

------------------------------------------------------------------ 사진 저장소 (Storage)
insert into storage.buckets (id, name, public) values ('photos', 'photos', false), ('community', 'community', false);

-- 오늘의 우리: 내 폴더에만 올리고, 같은 커플이 등록한 사진만 볼 수 있음
create policy "photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.photos p where p.path = name and p.couple_id = public.my_couple())));
create policy "photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.photos p where p.path = name and p.couple_id = public.my_couple())));
-- ponytail: 연결할 때 날짜가 겹쳐 버려진 사진 파일은 저장소에 남음. 쌓이면 주기적 정리 함수 추가.

-- 커뮤니티: 로그인한 사람은 모두 보고, 내 폴더에만 올리고 지움
create policy "community upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "community read" on storage.objects for select to authenticated using (bucket_id = 'community');
create policy "community delete" on storage.objects for delete to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);

------------------------------------------------------------------ 실시간 (상대가 바꾸면 바로 반영)
alter publication supabase_realtime add table public.events, public.annivs, public.photos, public.couples, public.couple_members;
