// 四段式 retailTake 渲染(共享,服务端/客户端通用,无 hooks 故无需 "use client")。
// generate.ts 把 retailTake 改成四段 markdown(**这次变了啥**…)后,任何纯文本渲染点
// (如链页 {it.retailTake})会泄漏字面 ** 星号——所有消费点都用本组件,单一来源。

// 行内加粗:**xxx** → <strong>
export function inlineBold(s: string, kp: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    /^\*\*[^*]+\*\*$/.test(seg) ? (
      <strong key={kp + i} className="font-semibold text-gray-900">
        {seg.slice(2, -2)}
      </strong>
    ) : (
      <span key={kp + i}>{seg}</span>
    )
  );
}

const TAKE_SECTIONS = /(?=\*\*(?:这次变了啥|影响哪条链|A股怎么映射|后续怎么验证)\*\*)/;

// 四段式按段拆行渲染;旧格式(自由文案)整段渲染。
export function TakeBody({ text }: { text: string }) {
  if (!text.includes("**这次变了啥**")) {
    return <p className="text-sm leading-relaxed text-gray-800">{inlineBold(text, "rt-")}</p>;
  }
  const parts = text.split(TAKE_SECTIONS).filter((seg) => seg.trim());
  return (
    <div className="space-y-1">
      {parts.map((seg, i) => (
        <p key={i} className="text-sm leading-relaxed text-gray-800">
          {inlineBold(seg.trim(), "rt-" + i)}
        </p>
      ))}
    </div>
  );
}
