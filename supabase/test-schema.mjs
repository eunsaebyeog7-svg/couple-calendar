// schema.sql 을 Supabase 와 비슷한 껍데기(auth, storage, 역할) 위에서 실행하고 RLS·함수 동작을 확인
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public bool);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to authenticated;
  grant all on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

const U = { a:"00000000-0000-0000-0000-00000000000a", b:"00000000-0000-0000-0000-00000000000b", c:"00000000-0000-0000-0000-00000000000c", d:"00000000-0000-0000-0000-00000000000d" };
for (const id of Object.values(U)) await db.query("insert into auth.users values ($1)", [id]);

// 사용자로서 실행 (RLS 적용)
async function as(u, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${u}', false); set role authenticated;`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); }
}
const fails = async (p, msg) => { await assert.rejects(p, e => (msg ? e.message.includes(msg) : true)); };

const ca = (await as(U.a, "select * from ensure_couple()"))[0];
assert.match(ca.code, /^[0-9A-F]{3}-[0-9A-F]{3}$/);
assert.equal((await as(U.a, "select * from ensure_couple()"))[0].id, ca.id, "ensure_couple 는 두 번 불러도 같은 공간");
await as(U.a, "update couples set start='2025-01-01' where id=my_couple()");
await fails(as(U.a, "update couples set code='AAA-AAA'"), "permission denied");
await as(U.a, "insert into events(couple_id,d,t,title) values (my_couple(),'2026-11-20','10:00','A 회의')");

await as(U.b, "select ensure_couple()");
await as(U.b, "insert into events(couple_id,d,title) values (my_couple(),'2026-11-21','B 하루종일')");
await fails(as(U.b, "insert into events(couple_id,d,title) values ($1,'2026-11-21','침입')", [ca.id]), "row-level security");
await fails(as(U.b, "select join_couple('XXX-XXX')"), "code_not_found");
const joined = (await as(U.b, "select * from join_couple($1)", [ca.code.toLowerCase()]))[0];
assert.equal(joined.id, ca.id);
assert.equal((await as(U.a, "select count(*)::int n from events"))[0].n, 2, "합치면 둘의 일정이 한 공간에");
assert.equal((await as(U.b, "select count(*)::int n from couples"))[0].n, 1, "B 의 빈 공간은 삭제");
assert.equal((await db.query("select count(*)::int n from couples")).rows[0].n, 1);
assert.equal((await as(U.c, "select count(*)::int n from events"))[0].n, 0, "다른 사람은 못 봄");
await as(U.c, "select ensure_couple()");
await fails(as(U.c, "select join_couple($1)", [ca.code]), "couple_full");
const cc = (await as(U.c, "select * from ensure_couple()"))[0];
await fails(as(U.a, "select join_couple($1)", [cc.code]), "already_linked");
assert.equal((await as(U.c, "select count(*)::int n from events"))[0].n, 0, "연결된 사람은 다른 코드로 못 옮겨 감");
// 상대가 올린 오늘의 우리 파일을 지울 수 있음
await as(U.b, "insert into photos(couple_id,d,path) values (my_couple(),'2026-11-25',$1)", [`${U.b}/p.jpg`]);
await as(U.b, "insert into storage.objects(bucket_id,name) values ('photos',$1)", [`${U.b}/p.jpg`]);
assert.equal((await as(U.a, "delete from storage.objects where name=$1 returning name", [`${U.b}/p.jpg`])).length, 1);
await as(U.a, "delete from photos where d='2026-11-25'");

// B 가 A 의 개인 일정은 못 지우고, 함께 일정은 지울 수 있음
await as(U.b, "delete from events where title='A 회의'");
assert.equal((await as(U.a, "select count(*)::int n from events where title='A 회의'"))[0].n, 1);
await as(U.a, "insert into events(couple_id,d,title,shared) values (my_couple(),'2026-11-22','함께 여행',true)");
await as(U.a, "insert into annivs(couple_id,name,d) values (my_couple(),'처음 만난 날','2025-01-01')");

// 연결 끊기: B 는 B 일정만 가져감
await as(U.b, "select leave_couple()");
assert.deepEqual((await as(U.b, "select title from events order by title")).map(r => r.title), ["B 하루종일"]);
assert.deepEqual((await as(U.a, "select title from events order by title")).map(r => r.title), ["A 회의", "함께 여행"]);
assert.equal((await as(U.b, "select count(*)::int n from annivs"))[0].n, 0);
await fails(as(U.b, "select leave_couple()"), "not_linked");

// 커뮤니티
for (const [u, n] of [[U.a,"민준"],[U.b,"서연"],[U.c,"하늘"],[U.d,"곰돌"]]) await as(u, "insert into profiles(nickname) values ($1)", [n]);
await fails(as(U.c, "insert into profiles(id,nickname) values ($1,'가짜')", [U.a]));
await fails(as(U.d, "update profiles set nickname='민준' where id=auth.uid()"), "duplicate");
const post = (await as(U.a, "insert into posts(cat,body) values ('qna','100일 선물 추천') returning id"))[0].id;
await fails(as(U.a, "update posts set hidden=true where id=$1", [post]), "permission denied");
await as(U.a, "update posts set body='100일 선물 추천해 주세요' where id=$1", [post]);
await as(U.b, "update posts set body='남의 글 수정' where id=$1", [post]);   // 정책상 0행
assert.equal((await as(U.c, "select body from posts"))[0].body, "100일 선물 추천해 주세요");
await as(U.b, "insert into comments(post_id,body) values ($1,'손편지요')", [post]);
await as(U.b, "insert into likes(post_id) values ($1)", [post]);
const feed = await as(U.c, "select p.body, a.nickname, (select count(*)::int from likes l where l.post_id=p.id) likes from posts p join profiles a on a.id=p.author");
assert.deepEqual(feed[0], { body:"100일 선물 추천해 주세요", nickname:"민준", likes:1 });

// 차단: C 는 A 글을 더 못 봄
await as(U.c, "insert into blocks(blocked) values ($1)", [U.a]);
assert.equal((await as(U.c, "select count(*)::int n from posts"))[0].n, 0);
await as(U.c, "delete from blocks");

// 신고 3건 → 자동 숨김, 작성자 본인은 계속 봄. 같은 사람 중복 신고 불가
await as(U.b, "insert into reports(post_id) values ($1)", [post]);
await fails(as(U.b, "insert into reports(post_id) values ($1)", [post]), "duplicate");
await as(U.c, "insert into reports(post_id) values ($1)", [post]);
assert.equal((await as(U.d, "select count(*)::int n from posts"))[0].n, 1);
await as(U.d, "insert into reports(post_id) values ($1)", [post]);
assert.equal((await as(U.d, "select count(*)::int n from posts"))[0].n, 0, "3건 신고 후 숨김");
assert.equal((await as(U.a, "select count(*)::int n from posts"))[0].n, 1, "작성자는 볼 수 있음");
assert.equal((await as(U.d, "select count(*)::int n from reports"))[0].n, 0, "신고 내용은 앱에서 못 읽음");

// 사진·저장소
await as(U.a, "insert into photos(couple_id,d,path) values (my_couple(),'2026-11-20',$1)", [`${U.a}/x.jpg`]);
await as(U.a, "insert into storage.objects(bucket_id,name) values ('photos',$1)", [`${U.a}/x.jpg`]);
await fails(as(U.c, "insert into storage.objects(bucket_id,name) values ('photos',$1)", [`${U.a}/y.jpg`]), "row-level security");
assert.equal((await as(U.c, "select count(*)::int n from storage.objects"))[0].n, 0, "남의 커플 사진 못 봄");

// Apple 토큰: 쓰기만, 읽기 불가
await as(U.a, "select save_apple_token('tok1')"); await as(U.a, "select save_apple_token('tok2')");
assert.equal((await as(U.a, "select count(*)::int n from apple_tokens"))[0].n, 0);
assert.equal((await db.query("select refresh_token from apple_tokens")).rows[0].refresh_token, "tok2");

// 회원 탈퇴: auth.users 삭제 → 연쇄 삭제
await db.query("delete from auth.users where id=$1", [U.a]);
assert.equal((await db.query("select count(*)::int n from posts")).rows[0].n, 0);
assert.equal((await db.query("select count(*)::int n from couples where id=$1", [ca.id])).rows[0].n, 0, "혼자 남은 공간 삭제");
assert.equal((await db.query("select count(*)::int n from apple_tokens")).rows[0].n, 0);
console.log("schema OK — 모든 확인 통과");
