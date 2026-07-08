import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

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
        brand: colors.indigo, // 唯一品牌强调色:链接/专区/导航当前项/focus
        ink: "#1a1d24", // 主文字/主按钮(墨色)
        canvas: "#f7f8fb", // 页面底(2026-07-08 改版微调)
        surface: "#ffffff", // 白卡
      },
      fontSize: {
        meta: ["0.75rem", { lineHeight: "1.4" }],
        body: ["0.875rem", { lineHeight: "1.7" }],
        title: ["0.9375rem", { lineHeight: "1.45" }],
        h2: ["1.125rem", { lineHeight: "1.35" }], // 模块标题 18px(2026-07-08 改版)
        h1: ["1.5rem", { lineHeight: "1.25" }], // 页面主标题 24px(2026-07-08 改版)
        display: ["1.5rem", { lineHeight: "1.2" }],
      },
    },
  },
  plugins: [],
};
export default config;
