// 일정표 사진 → 일정 목록. Claude 가 사진을 읽고 정해진 JSON 형식으로만 답하게 함.
// 배포: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  &&  supabase functions deploy parse-schedule
// 로그인한 사용자만 호출 가능 (공개 anon 키로는 거절). 사진은 저장하지 않고 읽기만 함.
import Anthropic from "npm:@anthropic-ai/sdk@1.9.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const client = new Anthropic(); // ANTHROPIC_API_KEY
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          d: { type: "string", description: "start date, YYYY-MM-DD" },
          end_d: { type: "string", description: "last date YYYY-MM-DD for multi-day events, otherwise empty string" },
          t: { type: "string", description: "start time HH:MM (24h), empty string if all-day" },
          title: { type: "string", description: "short title in the language written on the image" },
        },
        required: ["d", "end_d", "t", "title"],
        additionalProperties: false,
      },
    },
  },
  required: ["events"],
  additionalProperties: false,
};

const prompt = (today: string) => `This photo shows one person's schedule: a shift roster, class timetable, planner page, or calendar screenshot.
Today is ${today} (Korea time). Extract every dated event that belongs to this person.
- Resolve each date to YYYY-MM-DD. If the year is missing, pick the year that puts the date closest to today.
- For weekly timetables without dates, use the next occurrence of each weekday on or after today.
- t: start time in 24h HH:MM, or "" when there is no time (all-day, shift names like 주간/야간 without hours).
- end_d: the last date for an event that spans several days, otherwise "".
- title: short (max 30 characters), keep the original wording (e.g. 야간 근무, 수업 보강).
- Skip days marked off (휴무, OFF, 비번), holidays printed by the calendar itself, and anything you cannot read clearly.
- If there is no schedule in the image, return an empty list.`;

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // gateway 의 JWT 검사는 앱에 들어 있는 anon 키도 통과시키므로, 실제 로그인 사용자인지 다시 확인 (AI 비용 보호)
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  let body: { image?: string; today?: string };
  try { body = (await req.json()) ?? {}; } catch { return json({ error: "bad_request" }, 400); }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? "");
  if (!m) return json({ error: "bad_image" }, 400);
  if (m[2].length > 6_000_000) return json({ error: "too_large" }, 413);
  const today = DATE.test(body.today ?? "") ? body.today! : new Date().toISOString().slice(0, 10);

  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // 안전 분류기가 거절하면 서버가 대체 모델로 다시 시도
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } },
          { type: "text", text: prompt(today) },
        ],
      }],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return json({ events: [] });
    const text = res.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text && text.type === "text" ? text.text : '{"events":[]}');
    // 형식이 맞는 것만 통과 (사람이 추가 전에 한 번 더 확인함)
    const events = (parsed.events ?? [])
      .filter((e: Record<string, string>) => DATE.test(e.d) && (e.t === "" || TIME.test(e.t)) && (e.end_d === "" || (DATE.test(e.end_d) && e.end_d >= e.d)) && e.title?.trim())
      .slice(0, 60)
      .map((e: Record<string, string>) => ({ d: e.d, end_d: e.end_d || null, t: e.t || null, title: e.title.trim().slice(0, 60) }));
    return json({ events });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
    if (e instanceof Anthropic.APIError) { console.error("anthropic", e.status, e.message); return json({ error: "ai_failed" }, 502); }
    console.error(e);
    return json({ error: "failed" }, 500);
  }
});
