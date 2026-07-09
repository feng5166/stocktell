import { ImageResponse } from "next/og";

// 全站默认 OG 分享图(2026-07-09 SEO 底座):品牌卡,分享到微信/X/飞书时的封面。
// 动态页(insight/stock)后续可各自覆写;此为兜底。
export const runtime = "edge";
export const alt = "StockTell · 今日产业链推理";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: "linear-gradient(135deg, #0b0e1a 0%, #171c3a 60%, #1e1b4b 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: "#22d3ee",
              boxShadow: "0 0 40px #22d3ee",
            }}
          />
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 6 }}>STOCKTELL</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 72, fontWeight: 700, lineHeight: 1.25 }}>
          今日产业链推理
        </div>
        <div style={{ marginTop: 28, fontSize: 34, color: "#aab2e0", lineHeight: 1.5 }}>
          把全球事件翻译成产业链传导与 A 股映射
        </div>
        <div style={{ marginTop: 56, fontSize: 24, color: "#6b7399" }}>
          事件 × 产业链图谱 × 多跳推理 × 资产映射 × 证据验证
        </div>
      </div>
    ),
    size
  );
}
