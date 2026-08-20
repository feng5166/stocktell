import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { sentimentDisplayDate, sentimentSnapshot } from "@/lib/sentiment";
import { getOrCreateShareLink } from "@/lib/share-link";

// 「AI链今日情绪」竖版海报(2.3 P0-3,viral-growth-plan 卡1)。
// 硬规则(方案 §4):固定免责水印为模板层(非参数、无删除入口);无个人信息;
// 「今日温度」一句为规则模板(零 LLM),不含禁词、不含涨跌预测;
// 卡面市场数据(家数/均涨跌/净流入/指数)为客观事实展示,非判断散文。
// 字体:Noto Sans SC 按当卡文本子集加载(Google Fonts css2 + 旧 UA 取 TTF);
// 取不到字体宁可 503 也不出豆腐块卡。
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const W = 750;
const H = 1250;

// 按文本取中文字体子集(module 级缓存;同文本当日复用)
const fontCache = new Map<string, ArrayBuffer>();
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  const key = Array.from(new Set(text)).sort().join("");
  const hit = fontCache.get(key);
  if (hit) return hit;
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@500&text=${encodeURIComponent(key)}`;
    const css = await fetch(cssUrl, {
      // 旧 UA → Google 返回 TTF(satori 不吃 woff2)
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0 Safari/537.36" },
      cache: "no-store",
    }).then((r) => (r.ok ? r.text() : ""));
    // 旧 UA 下 Google 返回 woff(satori 支持 ttf/otf/woff,不支持 woff2)——三种都收
    const m = css.match(/src:\s*url\((.+?)\)\s*format\('(?:opentype|truetype|woff)'\)/);
    if (!m) return null;
    const buf = await fetch(m[1], { cache: "no-store" }).then((r) => (r.ok ? r.arrayBuffer() : null));
    if (buf) {
      if (fontCache.size > 8) fontCache.clear(); // 极简防漏
      fontCache.set(key, buf);
    }
    return buf;
  } catch {
    return null;
  }
}

// 二维码:服务端自取转 data URI(satori 内联外链 fetch 无超时控制,qrserver 抖动会把
// 整次渲染拖成 500)。取不到 → null,卡面降级为短链文本,不炸卡。
async function fetchQrDataUri(data: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      `https://api.qrserver.com/v1/create-qr-code/?size=132x132&margin=6&data=${encodeURIComponent(data)}`,
      { cache: "no-store", signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const pct1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

// 今日温度(规则模板,零 LLM;不预测、不含禁词/操作暗示)
function temperature(avg: number | null): { label: string; note: string; hot: boolean | null } {
  if (avg == null) return { label: "数据整理中", note: "今日情绪数据稍后更新", hot: null };
  if (avg >= 1) return { label: "偏暖", note: "AI 链多数标的今日上涨", hot: true };
  if (avg >= 0.2) return { label: "微暖", note: "AI 链今日涨多跌少", hot: true };
  if (avg > -0.2) return { label: "平静", note: "AI 链今日涨跌相当", hot: null };
  if (avg > -1) return { label: "微凉", note: "AI 链今日跌多涨少", hot: false };
  return { label: "偏冷", note: "AI 链多数标的今日下跌", hot: false };
}

export async function GET() {
  try {
    // 关键:在 handler 内把 ImageResponse 渲染成 buffer 再返回——
    // ImageResponse 的 satori/resvg 在 body 流式消费时才执行,直接 return 它的话
    // 渲染期异常发生在 handler 之后,try/catch 兜不住(线上 500 HTML 无日志实踩)。
    const img = await renderCard();
    const buf = await img.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300", // 同日卡内容稳定,5 分钟边缘缓存
      },
    });
  } catch (e) {
    // 渲染层任何异常(字体/wasm/数据形状)不裸抛 500 HTML——回 JSON 带线索,函数日志可查
    console.error("[sentiment-card] render failed:", e);
    const msg = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
    return NextResponse.json({ ok: false, error: "render-failed", detail: msg }, { status: 503 });
  }
}

async function renderCard() {
  const snap = await sentimentSnapshot().catch(() => null);
  const s = snap?.data;
  const date = sentimentDisplayDate(s);
  const a = s?.a ?? null;
  const us = s?.us ?? null;
  const temp = temperature(a ? a.avgPct : null);

  // 短链(每卡型每日一条,全量同款);承接页 = 情绪只读页
  const link = await getOrCreateShareLink("sentiment", date, "/land/sentiment").catch(() => null);
  const qrData = link?.url ?? "https://stocktell.me";
  const qrSrc = await fetchQrDataUri(qrData);

  const DISCLAIMER_WATERMARK = "信息参考,不构成投资建议。市场有风险。StockTell · stocktell.me";
  const SLOGAN = "我不懂产业链,你告诉我怎么想";

  // 收集全卡文本 → 字体子集
  const indices = us?.indices ?? [];
  const allText = [
    "AI链今日情绪·市场一瞥", date, temp.label, temp.note,
    "A股AI链上涨下跌平家平均主力净流入亿隔夜美股覆盖只扫码看今天的完整传导实时截至收盘资金美东",
    ...indices.map((i) => i.name),
    SLOGAN, DISCLAIMER_WATERMARK,
    "0123456789.%+-·—:,。()",
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ/", // QR 降级短链文本用
  ].join("");
  const font = await loadFont(allText);
  // buffer 化改造后本函数只能返回 ImageResponse——字体取不到改为 throw,统一走 GET 的 503 JSON
  if (!font) throw new Error("font-unavailable");

  const hotColor = temp.hot === true ? "#e0524d" : temp.hot === false ? "#3b82c4" : "#8b93a8";
  const hotBg = temp.hot === true ? "#fdf0ef" : temp.hot === false ? "#eef4fa" : "#f2f4f8";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          fontFamily: "NotoSansSC",
          padding: "48px 44px 36px",
        }}
      >
        {/* 品牌区(方案硬规则:左上 logo + slogan) */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: "#22d3ee" }} />
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 3, color: "#111827" }}>STOCKTELL</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 20, color: "#9ca3af" }}>{SLOGAN}</div>

        {/* 标题 + 日期 */}
        <div style={{ marginTop: 40, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#111827" }}>AI链今日情绪 · 市场一瞥</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 24, color: "#6b7280" }}>{date}</div>

        {/* 温度块 */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            alignItems: "center",
            gap: 24,
            background: hotBg,
            borderRadius: 20,
            padding: "28px 32px",
          }}
        >
          <div style={{ fontSize: 64, fontWeight: 700, color: hotColor }}>{temp.label}</div>
          <div style={{ fontSize: 26, color: "#4b5563", lineHeight: 1.4 }}>{temp.note}</div>
        </div>

        {/* A 股数据 */}
        {a && (
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 22, color: "#9ca3af" }}>
              <span>{`A 股 AI 链(${a.covered} 只)`}</span>
              <span>{a.pctLive ? `实时 ${a.pctAsOf}` : `${a.pctAsOf.slice(5)} 收盘`}</span>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 14 }}>
              <Stat label="上涨" value={`${a.up} 家`} color="#e0524d" />
              <Stat label="下跌" value={`${a.down} 家`} color="#3b82c4" />
              <Stat label="平均" value={pct1(a.avgPct)} color={a.avgPct >= 0 ? "#e0524d" : "#3b82c4"} />
              {a.netMfYi != null && (
                <Stat
                  label="主力净流入"
                  value={`${a.netMfYi > 0 ? "+" : ""}${a.netMfYi.toFixed(0)} 亿`}
                  color={a.netMfYi >= 0 ? "#e0524d" : "#3b82c4"}
                />
              )}
            </div>
            {a.netMfDate && (a.pctLive || a.netMfDate !== a.pctAsOf) && (
              <div style={{ marginTop: 8, fontSize: 18, color: "#9ca3af" }}>
                主力资金截至 {a.netMfDate.slice(5)} 收盘
              </div>
            )}
          </div>
        )}

        {/* 隔夜美股 */}
        {us && (
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 22, color: "#9ca3af" }}>
              <span>{`隔夜美股 AI 链(${us.covered} 只)`}</span>
              {us.asOf && <span>截至 {us.asOf.slice(5)} 美东</span>}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 14 }}>
              <Stat label="上涨" value={`${us.up} 家`} color="#e0524d" />
              <Stat label="下跌" value={`${us.down} 家`} color="#3b82c4" />
              <Stat label="平均" value={pct1(us.avgPct)} color={us.avgPct >= 0 ? "#e0524d" : "#3b82c4"} />
            </div>
            {indices.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
                {indices.slice(0, 3).map((ix) => (
                  <div
                    key={ix.name}
                    style={{
                      display: "flex",
                      gap: 8,
                      background: "#f5f6f9",
                      borderRadius: 12,
                      padding: "10px 16px",
                      fontSize: 22,
                      color: "#4b5563",
                    }}
                  >
                    <span>{ix.name}</span>
                    <span style={{ color: ix.change >= 0 ? "#e0524d" : "#3b82c4", fontWeight: 700 }}>
                      {pct(ix.change)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 底部:二维码 + 免责水印(模板固定层);QR 取不到时降级为短链文本,不炸卡 */}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 24, color: "#374151", fontWeight: 700 }}>
              {qrSrc ? "扫码看今天的完整传导" : qrData.replace(/^https?:\/\//, "")}
            </div>
            <div style={{ fontSize: 18, color: "#9ca3af", maxWidth: 460, lineHeight: 1.5 }}>
              {DISCLAIMER_WATERMARK}
            </div>
          </div>
          {qrSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrSrc} width={132} height={132} alt="" style={{ borderRadius: 8 }} />
          )}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [{ name: "NotoSansSC", data: font, weight: 500, style: "normal" }],
    }
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#f5f6f9",
        borderRadius: 14,
        padding: "14px 20px",
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: 20, color: "#9ca3af" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 30, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
