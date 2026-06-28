// StockTell 品牌 logo:黑色对话气泡(内含上升箭头)+ STOCK/TELL 细体字标。
// 默认横版(给 nav 用),高度用 className 控制(如 h-7)。
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 392 100"
      className={className}
      role="img"
      aria-label="StockTell"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="stk-logo" cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#3b414b" />
          <stop offset="1" stopColor="#0c0e13" />
        </radialGradient>
      </defs>
      <g transform="translate(6,6) scale(0.29)">
        <circle cx="120" cy="110" r="96" fill="url(#stk-logo)" />
        <path d="M70 170 L40 250 L150 178 Z" fill="url(#stk-logo)" />
        <path
          d="M78 150 L112 116 L138 138 L172 92"
          fill="none"
          stroke="#ffffff"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M150 84 L178 84 L178 112"
          fill="none"
          stroke="#ffffff"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <text
        x="92"
        y="64"
        fontFamily="'Avenir Next','Helvetica Neue',Arial,sans-serif"
        fontWeight="300"
        fontSize="42"
        letterSpacing="5"
        fill="#3a3f46"
      >
        STOCK<tspan fontWeight="600">TELL</tspan>
      </text>
    </svg>
  );
}
