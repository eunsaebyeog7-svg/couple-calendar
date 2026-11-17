// 회원 탈퇴: Apple 토큰 철회 → 내 사진 파일 삭제 → 계정 삭제(테이블 데이터는 on delete cascade).
// 앱스토어 5.1.1(v): Sign in with Apple 사용자는 탈퇴 시 토큰을 철회해야 함.
// 배포: supabase functions deploy delete-account
// Apple 비밀값(선택, Apple 로그인을 쓰면 필수):
//   supabase secrets set APPLE_TEAM_ID=... APPLE_KEY_ID=... APPLE_CLIENT_ID=<Services ID> APPLE_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { importPKCS8, SignJWT } from "npm:jose@6.2.17";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";

async function revokeApple(token: string) {
  const key = await importPKCS8(env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"), "ES256");
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env("APPLE_KEY_ID") })
    .setIssuer(env("APPLE_TEAM_ID")).setSubject(env("APPLE_CLIENT_ID"))
    .setAudience("https://appleid.apple.com").setIssuedAt().setExpirationTime("5m")
    .sign(key);
  const r = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("APPLE_CLIENT_ID"), client_secret: secret, token, token_type_hint: "refresh_token" }),
  });
  if (!r.ok) throw new Error(`apple revoke ${r.status} ${await r.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: "unauthorized" }, 401);

  // 1) Apple 토큰 철회 (실패해도 탈퇴는 진행하고 로그만 남김)
  const { data: tok } = await admin.from("apple_tokens").select("refresh_token").eq("user_id", user.id).maybeSingle();
  if (tok && env("APPLE_PRIVATE_KEY")) {
    try { await revokeApple(tok.refresh_token); } catch (e) { console.error(e); }
  }

  // 2) 내가 올린 사진 파일 (DB 행은 3에서 함께 지워짐)
  for (const bucket of ["photos", "community"]) {
    for (;;) {
      const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
      if (!files?.length) break;
      const { error } = await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
      if (error) { console.error(error); break; }
    }
  }

  // 3) 계정 삭제 → profiles, 일정, 사진 기록, 글, 댓글, 좋아요, 차단, 신고, 커플 연결이 연쇄 삭제
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) { console.error(error); return json({ error: "delete_failed" }, 500); }
  return json({ ok: true });
});
