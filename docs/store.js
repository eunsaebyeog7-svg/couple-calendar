// 데이터 저장소 두 가지를 같은 모양으로 제공. 화면 코드는 어느 쪽인지 몰라도 됨.
//  - makeLocal: 이 기기 localStorage (데모, 서버 설정 전)
//  - makeCloud: Supabase (커플 동기화, 커뮤니티 공유, 사진 저장소, AI 일정 읽기)
// 화면이 쓰는 일정 모양: {id, d, end_d, t, title, rep, who:"me"|"you"|"both", mine}
"use strict";
const LKEY = "cc.v1";
const LDEF = {
  events: [], annivs: [], photos: {}, start: "", nickname: "",
  settings: { wToday: true, wAnniv: true, wPhoto: true, theme: "system", zoom: 1, nAnniv: false, nDaily: false },
  posts: null, blocked: [], reported: [], rules: false,
};
function readLocal() {
  try { const s = JSON.parse(localStorage.getItem(LKEY) || "{}"); return { ...structuredClone(LDEF), ...s, settings: { ...LDEF.settings, ...s.settings } }; }
  catch { return structuredClone(LDEF); }
}
function writeLocal(L) { try { localStorage.setItem(LKEY, JSON.stringify(L)); return true; } catch { return false; } }
const newId = () => crypto.randomUUID?.() || String(Date.now() + Math.random());
const ts = (s) => new Date(s).getTime();

/* ------------------------------------------------------------ 이 기기 */
function makeLocal(L, persist, demo) {
  const nick = () => L.nickname || (demo ? "민준" : "나");
  const view = (p) => ({ ...p, author_id: p.author, mine: !!p.mine, comments: p.comments.filter((c) => !L.blocked.includes(c.author) && !L.reported.includes(c.id)).map((c) => ({ ...c, author_id: c.author })) });
  return {
    cloud: false,
    async load() {
      return {
        events: L.events.map((e) => ({ rep: "none", end_d: null, ...e, mine: e.who !== "you" })),
        annivs: L.annivs, photos: L.photos, start: L.start,
        couple: { code: "DEMO-01", linked: demo, partner: demo ? "서연" : "" },
        me: { id: "me", nickname: nick() },
      };
    },
    async addEvent(e) { L.events.push({ ...e, id: newId(), who: e.shared ? "both" : "me" }); persist(); },
    async updateEvent(id, e) { const x = L.events.find((v) => v.id === id); Object.assign(x, e, { who: e.shared ? "both" : x.who === "you" ? "you" : "me" }); persist(); },
    async delEvent(id) { L.events = L.events.filter((v) => v.id !== id); persist(); },
    async addAnniv(a) { L.annivs.push({ ...a, id: newId() }); persist(); },
    async delAnniv(id) { L.annivs = L.annivs.filter((v) => v.id !== id); persist(); },
    async setStart(d) { L.start = d; persist(); },
    async setPhoto(d, dataUrl) { L.photos[d] = dataUrl; if (!persist()) { delete L.photos[d]; throw new Error("full"); } },
    async delPhoto(d) { delete L.photos[d]; persist(); },
    async setNickname(n) { L.nickname = n; persist(); },
    async join() { throw new Error("needs_login"); },
    async leave() { throw new Error("needs_login"); },
    async deleteAccount() {},
    async parse() { return null; }, // null = 예시 결과 사용

    async listPosts({ cat, q, mine } = {}) {
      return L.posts
        .filter((p) => !L.blocked.includes(p.author) && !L.reported.includes(p.id) && (!cat || p.cat === cat) && (!mine || p.mine) && (!q || p.text.includes(q)))
        .sort((a, b) => b.t - a.t).map(view);
    },
    async addPost({ cat, text, img }) { L.posts.push({ id: newId(), cat, author: nick(), mine: true, text, img, t: Date.now(), likes: 0, liked: false, comments: [] }); persist(); },
    async editPost(id, text) { L.posts.find((p) => p.id === id).text = text; persist(); },
    async delPost(id) { L.posts = L.posts.filter((p) => p.id !== id); persist(); },
    async addComment(pid, text) { L.posts.find((p) => p.id === pid).comments.push({ id: newId(), author: nick(), mine: true, text, t: Date.now() }); persist(); },
    async delComment(pid, cid) { const p = L.posts.find((x) => x.id === pid); p.comments = p.comments.filter((c) => c.id !== cid); persist(); },
    async like(id, on) { const p = L.posts.find((x) => x.id === id); p.liked = on; p.likes += on ? 1 : -1; persist(); },
    async report(kind, id) { L.reported.push(id); persist(); },
    async block(authorId) { L.blocked.push(authorId); persist(); },
    async unblock(authorId) { L.blocked = L.blocked.filter((n) => n !== authorId); persist(); },
    async blocked() { return L.blocked.map((n) => ({ id: n, nickname: n })); },
  };
}

/* ------------------------------------------------------------ Supabase */
function makeCloud(sb, user, onRemoteChange) {
  let cid = null, channel = null, timer = null, stopped = false;
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  const blob = async (dataUrl) => (await fetch(dataUrl)).blob();
  const signed = async (bucket, paths) => {
    if (!paths.length) return {};
    const rows = ok(await sb.storage.from(bucket).createSignedUrls(paths, 3600));
    return Object.fromEntries(rows.filter((r) => r.signedUrl).map((r) => [r.path, r.signedUrl]));
  };
  const upload = async (bucket, dataUrl) => {
    const path = `${user.id}/${newId()}.jpg`;
    ok(await sb.storage.from(bucket).upload(path, await blob(dataUrl), { contentType: "image/jpeg" }));
    return path;
  };
  // 커뮤니티는 내 파일만, 오늘의 우리는 같은 커플 파일이면 지울 수 있음 (schema.sql 저장소 정책)
  const removeFile = (bucket, path) => path && (bucket === "photos" || path.startsWith(user.id + "/")) && sb.storage.from(bucket).remove([path]);

  function subscribe() {
    if (channel) sb.removeChannel(channel);
    if (stopped) return;
    const again = () => { clearTimeout(timer); timer = setTimeout(onRemoteChange, 300); };
    channel = sb.channel("couple-" + cid);
    for (const table of ["events", "annivs", "photos", "couple_members"])
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `couple_id=eq.${cid}` }, again);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "couples", filter: `id=eq.${cid}` }, again);
    // 삭제 이벤트에는 couple_id 가 안 실려 와서 필터가 안 맞음 → 필터 없이 받음 (RLS 가 내 커플 것만 보냄)
    for (const table of ["events", "annivs", "photos"])
      channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, again);
    channel.subscribe();
  }

  const api = {
    cloud: true,
    async load() {
      const couple = ok(await sb.rpc("ensure_couple"));
      if (couple.id !== cid) { cid = couple.id; subscribe(); }
      const [members, events, annivs, photos] = await Promise.all([
        sb.from("couple_members").select("user_id").then(ok),
        sb.from("events").select("*").then(ok),
        sb.from("annivs").select("*").then(ok),
        sb.from("photos").select("d,path").then(ok),
      ]);
      const ids = members.map((m) => m.user_id);
      const profiles = ok(await sb.from("profiles").select("id,nickname").in("id", ids));
      const nick = (id) => profiles.find((p) => p.id === id)?.nickname;
      const partnerId = ids.find((id) => id !== user.id);
      const urls = await signed("photos", photos.map((p) => p.path));
      return {
        events: events.map((e) => ({
          id: e.id, d: e.d, end_d: e.end_d, t: e.t ? e.t.slice(0, 5) : "", title: e.title, rep: e.rep,
          who: e.shared ? "both" : e.owner === user.id ? "me" : "you", mine: e.owner === user.id || e.shared,
        })),
        annivs, start: couple.start || "",
        photos: Object.fromEntries(photos.filter((p) => urls[p.path]).map((p) => [p.d, urls[p.path]])),
        couple: { code: couple.code, linked: !!partnerId, partner: partnerId ? nick(partnerId) || "상대방" : "" },
        me: { id: user.id, nickname: nick(user.id) || "" },
      };
    },
    async addEvent(e) { ok(await sb.from("events").insert({ couple_id: cid, d: e.d, end_d: e.end_d, t: e.t || null, title: e.title, rep: e.rep, shared: e.shared })); },
    async updateEvent(id, e) { ok(await sb.from("events").update({ d: e.d, end_d: e.end_d, t: e.t || null, title: e.title, rep: e.rep, shared: e.shared }).eq("id", id)); },
    async delEvent(id) { ok(await sb.from("events").delete().eq("id", id)); },
    async addAnniv(a) { ok(await sb.from("annivs").insert({ couple_id: cid, name: a.name, d: a.d, yearly: a.yearly })); },
    async delAnniv(id) { ok(await sb.from("annivs").delete().eq("id", id)); },
    async setStart(d) { ok(await sb.from("couples").update({ start: d || null }).eq("id", cid)); },
    async setPhoto(d, dataUrl) {
      const old = ok(await sb.from("photos").select("path").eq("d", d).maybeSingle());
      const path = await upload("photos", dataUrl);
      if (old) await removeFile("photos", old.path);   // 행이 남아 있을 때 지워야 저장소 정책 통과
      ok(await sb.from("photos").upsert({ couple_id: cid, d, path, owner: user.id }));
    },
    async delPhoto(d) {
      const old = ok(await sb.from("photos").select("path").eq("d", d).maybeSingle());
      if (old) await removeFile("photos", old.path);
      ok(await sb.from("photos").delete().eq("d", d));
    },
    async setNickname(n) {
      const { error } = await sb.from("profiles").upsert({ id: user.id, nickname: n });
      if (error?.code === "23505") throw new Error("nickname_taken");
      if (error) throw error;
    },
    async join(code) { ok(await sb.rpc("join_couple", { p_code: code })); },
    async leave() { ok(await sb.rpc("leave_couple")); },
    async deleteAccount() { ok(await sb.functions.invoke("delete-account", { method: "POST" })); },
    async parse(image, today) { return ok(await sb.functions.invoke("parse-schedule", { body: { image, today } })).events; },
    stop() { stopped = true; clearTimeout(timer); if (channel) sb.removeChannel(channel); channel = null; },

    // ponytail: 최근 글 30개씩. 좋아요는 행을 통째로 받아 셈 — 글이 많아지면 count 뷰로 바꿀 것.
    async listPosts({ cat, q, mine, before } = {}) {
      let query = sb.from("posts")
        .select("id,cat,body,image_path,created_at,author,profiles(nickname),likes(user_id),comments(id,body,created_at,author,profiles(nickname))")
        .order("created_at", { ascending: false }).limit(30);
      if (cat) query = query.eq("cat", cat);
      if (mine) query = query.eq("author", user.id);
      if (q) query = query.ilike("body", `%${q.replace(/[%_\\]/g, "\\$&")}%`);
      if (before) query = query.lt("created_at", new Date(before).toISOString());
      const rows = ok(await query);
      const urls = await signed("community", rows.map((p) => p.image_path).filter(Boolean));
      return rows.map((p) => ({
        id: p.id, cat: p.cat, text: p.body, t: ts(p.created_at), img: urls[p.image_path] || null, image_path: p.image_path,
        author: p.profiles?.nickname || "알 수 없음", author_id: p.author, mine: p.author === user.id,
        likes: p.likes.length, liked: p.likes.some((l) => l.user_id === user.id),
        comments: p.comments.sort((a, b) => ts(a.created_at) - ts(b.created_at)).map((c) => ({
          id: c.id, text: c.body, t: ts(c.created_at), author: c.profiles?.nickname || "알 수 없음", author_id: c.author, mine: c.author === user.id,
        })),
      }));
    },
    async addPost({ cat, text, img }) {
      const image_path = img ? await upload("community", img) : null;
      ok(await sb.from("posts").insert({ cat, body: text, image_path }));
    },
    async editPost(id, text) { ok(await sb.from("posts").update({ body: text }).eq("id", id)); },
    async delPost(id) {
      const rows = ok(await sb.from("posts").delete().eq("id", id).select("image_path"));
      rows.forEach((r) => removeFile("community", r.image_path));
    },
    async addComment(pid, text) { ok(await sb.from("comments").insert({ post_id: pid, body: text })); },
    async delComment(pid, cid2) { ok(await sb.from("comments").delete().eq("id", cid2)); },
    async like(id, on) { ok(on ? await sb.from("likes").insert({ post_id: id }) : await sb.from("likes").delete().eq("post_id", id).eq("user_id", user.id)); },
    async report(kind, id) {
      const { error } = await sb.from("reports").insert(kind === "post" ? { post_id: id } : { comment_id: id });
      if (error && error.code !== "23505") throw error; // 이미 신고함 = 성공으로 봄
    },
    async block(authorId) { const { error } = await sb.from("blocks").insert({ blocked: authorId }); if (error && error.code !== "23505") throw error; },
    async unblock(authorId) { ok(await sb.from("blocks").delete().eq("blocked", authorId)); },
    async blocked() { return ok(await sb.from("blocks").select("blocked,profiles(nickname)")).map((b) => ({ id: b.blocked, nickname: b.profiles?.nickname || "알 수 없음" })); },
  };
  return api;
}
