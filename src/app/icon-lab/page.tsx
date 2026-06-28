// 临时:icon 配色对比页,选定后删除。
export const dynamic = "force-dynamic";

const SCHEMES: { name: string; a: string; b: string }[] = [
  { name: "经典黑(当前)", a: "#2a2f3a", b: "#0b0d12" },
  { name: "石墨蓝灰", a: "#334155", b: "#0f172a" },
  { name: "深海蓝", a: "#1e3a5f", b: "#0a1628" },
  { name: "宝蓝", a: "#2563eb", b: "#0c2a6b" },
  { name: "靛蓝", a: "#4338ca", b: "#1e1b4b" },
  { name: "暗紫", a: "#6d28d9", b: "#3b0764" },
  { name: "A股红金", a: "#b91c1c", b: "#5e1414" },
  { name: "墨青", a: "#155e63", b: "#06292b" },
  { name: "暖棕金", a: "#78350f", b: "#1c1207" },
  { name: "午夜蓝黑", a: "#172554", b: "#020617" },
];

function Icon({ a, b, id }: { a: string; b: string; id: string }) {
  return (
    <svg width="150" height="150" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="80" y1="40" x2="440" y2="480" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${id})`} />
      <path
        d="M150 356 L256 312 L354 236"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.25"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g strokeLinecap="round">
        <line x1="158" y1="300" x2="158" y2="382" stroke="#ffffff" strokeWidth="9" />
        <rect x="138" y="322" width="40" height="46" rx="9" fill="#ffffff" />
        <line x1="256" y1="258" x2="256" y2="374" stroke="#ffffff" strokeWidth="9" />
        <rect x="236" y="282" width="40" height="70" rx="9" fill="#ffffff" />
        <line x1="354" y1="190" x2="354" y2="338" stroke="#fcd34d" strokeWidth="9" />
        <rect x="334" y="214" width="40" height="92" rx="9" fill="#fbbf24" />
      </g>
      <path
        d="M398 120 C402 150 410 158 440 162 C410 166 402 174 398 204 C394 174 386 166 356 162 C386 158 394 150 398 120 Z"
        fill="#fde68a"
      />
      <circle cx="446" cy="208" r="10" fill="#fde68a" />
    </svg>
  );
}

export default function IconLab() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold text-gray-900">StockTell Icon 配色候选</h1>
        <p className="mt-1 text-sm text-gray-500">
          选好告诉我编号/名字,我就把正式图标换成那一版(并删掉此页)。
        </p>
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
          {SCHEMES.map((s, i) => (
            <div key={s.name} className="flex flex-col items-center gap-2">
              <Icon a={s.a} b={s.b} id={`g${i}`} />
              <span className="text-sm font-medium text-gray-700">
                {i + 1}. {s.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
