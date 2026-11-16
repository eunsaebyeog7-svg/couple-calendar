// 앱 아이콘·시작 화면 원본 만들기: node assets/make.mjs && npx capacitor-assets generate
// 두 원(나·너)이 겹친 곳이 '함께' 색이 되는 앱의 색 규칙을 그대로 아이콘으로.
import sharp from "sharp";
const mark = (s, cx, cy) => {
  // 두 장의 달력 카드(나·너)가 비스듬히 겹치고, 겹친 곳은 '함께' 보라색
  const w = s * .40, r = s * .07, o = s * .085, a = [cx - w / 2 - o, cy - w / 2 - o], b = [cx - w / 2 + o, cy - w / 2 + o];
  const card = ([x, y], fill, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${r}" fill="${fill}" ${extra}/>`;
  const rings = ([x, y]) => [.3, .7].map(f => `<rect x="${x + w * f - s * .015}" y="${y - s * .03}" width="${s * .03}" height="${s * .075}" rx="${s * .015}" fill="#2b3240"/>`).join("");
  return `<defs><clipPath id="a">${card(a, "#000")}</clipPath></defs>
  ${card(a, "#1f7a8c")}${card(b, "#c2416b")}${card(b, "#6d4fb3", 'clip-path="url(#a)"')}${rings(a)}`;
};
const svg = (w, h, bg, s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ""}${mark(s, w / 2, h / 2)}</svg>`);
const out = (buf, f) => sharp(buf).png().toFile(new URL(f, import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
await out(svg(1024, 1024, "#fbf7f2", 1200), "icon-only.png");
await out(svg(1024, 1024, null, 900), "icon-foreground.png");      // 안드로이드 적응형 아이콘 안전 영역
await out(svg(1024, 1024, "#fbf7f2", 0).subarray(0), "icon-background.png");
await out(svg(2732, 2732, "#fbf7f2", 1100), "splash.png");
await out(svg(2732, 2732, "#12151c", 1100), "splash-dark.png");
console.log("assets ok");
