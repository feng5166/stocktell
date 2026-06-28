// 临时:StockTell logo(FateTell 同系列)候选预览,选定后删除。
export const dynamic = "force-dynamic";

const FONT = "'Avenir Next','Helvetica Neue',Arial,sans-serif";

// 标记:黑色光泽对话气泡 + 内部白色上升箭头。bubble/stroke 颜色可调以适配明/暗底。
function Mark({
  id,
  bubbleA = "#3b414b",
  bubbleB = "#0c0e13",
  stroke = "#ffffff",
}: {
  id: string;
  bubbleA?: string;
  bubbleB?: string;
  stroke?: string;
}) {
  return (
    <g>
      <defs>
        <radialGradient id={id} cx="0.36" cy="0.3" r="0.85">
          <stop offset="0" stopColor={bubbleA} />
          <stop offset="1" stopColor={bubbleB} />
        </radialGradient>
      </defs>
      <circle cx="120" cy="110" r="96" fill={`url(#${id})`} />
      <path d="M70 170 L40 250 L150 178 Z" fill={`url(#${id})`} />
      <path
        d="M78 150 L112 116 L138 138 L172 92"
        fill="none"
        stroke={stroke}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M150 84 L178 84 L178 112"
        fill="none"
        stroke={stroke}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function Wordmark({ fill }: { fill: string }) {
  return (
    <>
      <text x="380" y="170" fontFamily={FONT} fontWeight="300" fontSize="96" letterSpacing="26" fill={fill}>
        STOCK
      </text>
      <text x="380" y="296" fontFamily={FONT} fontWeight="300" fontSize="96" letterSpacing="26" fill={fill}>
        TELL
      </text>
      <circle cx="690" cy="262" r="13" fill={fill} />
      <path d="M690 275 Q686 296 668 304" fill="none" stroke={fill} strokeWidth="9" strokeLinecap="round" />
    </>
  );
}

function Card({ title, bg, children }: { title: string; bg: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="mb-2 text-xs text-gray-400">{title}</div>
      <div className="overflow-hidden rounded-xl" style={{ background: bg }}>
        {children}
      </div>
    </div>
  );
}

export default function IconLab() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">StockTell Logo 候选(FateTell 同系列)</h1>
          <p className="mt-1 text-sm text-gray-500">
            黑色光泽对话气泡 + 内部上升箭头(=「告诉你行情怎么走」)。选好/要调告诉我。
          </p>
        </div>

        <Card title="A · 完整 logo(浅底)" bg="#f1f1f2">
          <svg width="100%" viewBox="0 0 1080 380" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(70,70)">
              <Mark id="ma" />
            </g>
            <Wordmark fill="#454b54" />
          </svg>
        </Card>

        <Card title="B · 完整 logo(深底反白)" bg="#0b0d12">
          <svg width="100%" viewBox="0 0 1080 380" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(70,70)">
              <Mark id="mb" bubbleA="#e9eef5" bubbleB="#aab4c2" stroke="#0b0d12" />
            </g>
            <Wordmark fill="#d6dbe2" />
          </svg>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card title="C · App 图标(深底)" bg="transparent">
            <svg width="100%" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <rect width="512" height="512" rx="116" fill="#0b0d12" />
              <g transform="translate(136,150) scale(1.0)">
                <Mark id="mc" bubbleA="#e9eef5" bubbleB="#b6c0cd" stroke="#0b0d12" />
              </g>
            </svg>
          </Card>
          <Card title="D · App 图标(浅底)" bg="transparent">
            <svg width="100%" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <rect width="512" height="512" rx="116" fill="#f1f1f2" />
              <g transform="translate(136,150) scale(1.0)">
                <Mark id="md" />
              </g>
            </svg>
          </Card>
          <Card title="E · 纯标记" bg="#f1f1f2">
            <svg width="100%" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(28,38)">
                <Mark id="me" />
              </g>
            </svg>
          </Card>
        </div>
      </div>
    </div>
  );
}
