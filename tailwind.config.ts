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
      // 2026-08-18 色温校准(负责人拍板):方向从「AI SaaS 后台」转向「专业投研终端」——
      // Bloomberg / Linear / 财经研究终端的混合感。黑灰是主角,紫是品牌,红绿是数据,橙是风险。
      // 三条硬规则:① 中性灰去蓝调(冷灰→中性微暖);② 品牌紫降饱和,只做「可操作入口/
      // 当前选中/核心关系」;③ 红绿统一 A 股口径(红=涨/资金进场,绿=跌/资金流出)。
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // 品牌紫(#5856D6):比旧 #5B5CE2 更沉、饱和度更低,不再像电商/AI SaaS。
        // 页面占比 ≤5–8%,禁止大面积色块,禁止用作普通说明文字。
        brand: {
          50: "#F1F0FF", // 浅紫底(chip/标签唯一允许的紫底)
          100: "#E4E3FB",
          200: "#CBCAF4",
          300: "#ADACEA",
          400: "#8A88DF",
          500: "#6D6BD9",
          600: "#5856D6", // 主色:链接/主 CTA/active
          700: "#4A48BE",
          800: "#403EAA", // 深紫:hover/强调文字
          900: "#343277",
        },
        // 中性灰(全站主角):去掉 Tailwind 默认 gray 的蓝调,换成中性微暖。
        // 覆盖默认 gray,所有既有 text-gray-* / border-gray-* 一次性换温。
        gray: {
          50: "#FAFAFB", // 次级分区底
          100: "#F1F2F5",
          200: "#E9EAF0", // 卡片边框
          300: "#D3D6DE",
          400: "#9297A3", // meta:时间/来源/代码
          500: "#7B8190", // 中性文字
          600: "#626878",
          700: "#4A505E", // 正文
          800: "#363B47",
          900: "#252833", // 核心结论/标题
          950: "#16181F",
        },
        // slate 与 gray 同源(历史上两套灰混用,统一到一条中性轴,避免页面出现两种灰)
        slate: {
          50: "#FAFAFB",
          100: "#F1F2F5",
          200: "#E9EAF0",
          300: "#D3D6DE",
          400: "#9297A3",
          500: "#7B8190",
          600: "#626878",
          700: "#4A505E",
          800: "#363B47",
          900: "#252833",
          950: "#16181F",
        },
        // 状态色:红=上涨/资金进场(A 股口径),锚点 #D94C4C。比默认 red 柔和一档。
        red: {
          50: "#FDF5F5",
          100: "#FAE7E6",
          200: "#F3CBCA",
          300: "#E9A9A7",
          400: "#E17E7C",
          500: "#DC6260",
          600: "#D94C4C",
          700: "#BE3F3F",
          800: "#9C3636",
          900: "#7E2F2F",
        },
        rose: {
          50: "#FDF5F5",
          100: "#FAE7E6",
          200: "#F3CBCA",
          300: "#E9A9A7",
          400: "#E17E7C",
          500: "#DC6260",
          600: "#D94C4C",
          700: "#BE3F3F",
          800: "#9C3636",
          900: "#7E2F2F",
        },
        // 绿=下跌/资金流出(A 股口径),锚点 #2F9B72。
        emerald: {
          50: "#F2FAF6",
          100: "#DEF2E9",
          200: "#B9E4D1",
          300: "#8CD1B4",
          400: "#55B893",
          500: "#38A67C",
          600: "#2F9B72",
          700: "#27835F",
          800: "#226C50",
          900: "#1D5943",
        },
        green: {
          50: "#F2FAF6",
          100: "#DEF2E9",
          200: "#B9E4D1",
          300: "#8CD1B4",
          400: "#55B893",
          500: "#38A67C",
          600: "#2F9B72",
          700: "#27835F",
          800: "#226C50",
          900: "#1D5943",
        },
        // 橙=风险提醒/需要警惕(洗盘/衰竭/合规横幅),锚点 #D98B28。
        amber: {
          50: "#FDF8EF",
          100: "#FAEDD6",
          200: "#F3D9AC",
          300: "#E9BE77",
          400: "#E0A44C",
          500: "#D98B28",
          600: "#C67B22",
          700: "#A3641D",
          800: "#82501A",
          900: "#684116",
        },
        orange: {
          50: "#FDF8EF",
          100: "#FAEDD6",
          200: "#F3D9AC",
          300: "#E9BE77",
          400: "#E0A44C",
          500: "#D98B28",
          600: "#C67B22",
          700: "#A3641D",
          800: "#82501A",
          900: "#684116",
        },
        // indigo 归到品牌轴(历史上「触发源」等 chip 用 indigo,与品牌紫两种紫并存最难看)
        indigo: {
          50: "#F1F0FF",
          100: "#E4E3FB",
          200: "#CBCAF4",
          300: "#ADACEA",
          400: "#8A88DF",
          500: "#6D6BD9",
          600: "#5856D6",
          700: "#4A48BE",
          800: "#403EAA",
          900: "#343277",
        },
        ink: "#252833", // 主文字/核心结论(墨色,比旧 #1a1d24 略提亮,减轻"死黑")
        canvas: "#F7F8FA", // 页面底:中性浅灰(旧 #F8F9FC 偏冷蓝,已弃)
        surface: "#ffffff", // 白卡
        subtle: "#FAFAFB", // 次级分区底
        line: "#E9EAF0", // 卡片/分隔边框
      },
      // 五级排版(2026-08-18 定死):中文 PingFang SC 撑结构,数字/英文走 Inter。
      // 字重全站只用 400/500/600,不用 700+——投研产品不靠"喊"。
      fontSize: {
        meta: ["0.75rem", { lineHeight: "1.5" }], // 12 / 时间·来源·代码
        body: ["0.875rem", { lineHeight: "1.75" }], // 14 / 正文
        title: ["0.9375rem", { lineHeight: "1.7" }], // 15 / 核心判断
        h3: ["1.0625rem", { lineHeight: "1.45" }], // 17 / 卡片标题
        h2: ["1.125rem", { lineHeight: "1.4" }], // 18 / 模块标题
        h1: ["1.5rem", { lineHeight: "1.3" }], // 24 / 页面主标题
        display: ["1.5rem", { lineHeight: "1.2" }], // 24 / 统计数字
      },
      fontFamily: {
        // Inter 只带拉丁子集 → 中文自动落到 PingFang SC,天然形成"数字 Inter+中文苹方"混排
        sans: [
          "var(--font-inter)",
          "PingFang SC",
          "Microsoft YaHei",
          "Noto Sans CJK SC",
          "Hiragino Sans GB",
          "-apple-system",
          "BlinkMacSystemFont",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        // 投研产品用边框分层,不用阴影分层——shadow 只留一档几乎看不见的
        sm: "0 1px 3px rgba(20, 20, 40, 0.04)",
        DEFAULT: "0 1px 3px rgba(20, 20, 40, 0.04)",
        md: "0 2px 8px rgba(20, 20, 40, 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
