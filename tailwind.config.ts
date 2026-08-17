import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ===== Design tokens(见 docs/视觉设计系统规范.md)=====
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // 唯一品牌强调色(2026-08-16 首页视觉优化定稿):#5B5CE2 蓝紫,只做强调
        // (主按钮/链接/active/关键 chip),页面占比 ≤5–8%,禁止大面积色块。
        brand: {
          50: "#EEF0FF",
          100: "#E2E5FD",
          200: "#C9CDFA",
          300: "#A9ADF4",
          400: "#8487EC",
          500: "#6D6EE7",
          600: "#5B5CE2",
          700: "#4A4BCB",
          800: "#3F40B5",
          900: "#35368F",
        },
        ink: "#1a1d24", // 主文字/主按钮(墨色)
        canvas: "#F8F9FC", // 页面底(极浅冷灰:页面浅灰,卡片白色)
        surface: "#ffffff", // 白卡
      },
      fontSize: {
        meta: ["0.75rem", { lineHeight: "1.4" }],
        body: ["0.875rem", { lineHeight: "1.7" }],
        title: ["0.9375rem", { lineHeight: "1.45" }],
        h2: ["1.0625rem", { lineHeight: "1.35" }],
        h1: ["1.375rem", { lineHeight: "1.3" }],
        display: ["1.5rem", { lineHeight: "1.2" }],
      },
    },
  },
  plugins: [],
};
export default config;
