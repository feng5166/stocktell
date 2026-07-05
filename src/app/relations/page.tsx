import type { Metadata } from "next";
import Link from "next/link";
import { REL_CHIP_CLS, EVIDENCE_LABEL } from "@/lib/relation-rank";

// B6 关系说明(glossary)。公开轻量说明页:关系档 6 种 + 证据状态 3 种 + 历史统计为何不是预测。
// 减少用户误解、给 Phase 3 统一口径铺垫。静态页(SSG),大陆 TTFB 优先。
export const metadata: Metadata = {
  title: "关系说明 · StockTell",
  description: "怎么读 StockTell 的产业链关系:触发源 / 直接 / 间接 / 情绪 / 弱 / 待验证,证据状态,以及历史统计为什么不是预测。",
};

const RELATIONS: { label: string; who: string; desc: string }[] = [
  { label: "触发源", who: "美股 / 海外公司(NVDA、PLTR…)", desc: "事件的触发源、海外对照,不是 A 股映射标的。海外一动、我们看它会不会传导到国内产业链。" },
  { label: "直接映射", who: "A 股 / H 股", desc: "传导路径短 + 业务入口明确(如光模块、AI 服务器、数据中心电源)。仍需订单 / 客户 / 收入 / 毛利来核实,不代表已确认受益。" },
  { label: "间接映射", who: "A 股 / H 股", desc: "环节相关但隔一层、暴露不纯(如 PCB / 材料 / 上游器件)。需要订单、客户、收入占比来验证。" },
  { label: "情绪映射", who: "A 股 / H 股", desc: "同主题、同概念联想,但缺直接业务传导。更多是情绪相关,波动大。" },
  { label: "弱映射", who: "A 股 / H 股", desc: "关系远、外围概念,只作观察,不作核心判断。" },
  { label: "待验证", who: "A 股 / H 股", desc: "有线索但证据不足、尚未人工核定。显示「待验证」不代表相关,只表示还没归档。" },
];

const EVIDENCE: { key: string; desc: string }[] = [
  { key: "verified", desc: "有较稳定的一手披露入口,且业务入口与该环节高度一致。【不代表】具体订单 / 收入数字已逐项核实。" },
  { key: "partially_verified", desc: "有一手披露入口、业务方向相关,但具体订单 / 客户 / 收入占比 / 毛利率仍需进一步核验。" },
  { key: "needs_review", desc: "没有一手披露入口或证据不足,待补来源。" },
];

function Chip({ label }: { label: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${REL_CHIP_CLS[label] ?? "bg-gray-100 text-gray-600"}`}>{label}</span>;
}

export default function RelationsGlossaryPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-h1 font-semibold tracking-tight text-gray-900">关系说明</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        StockTell 把「一件海外大事会不会影响国内某只票」翻译成一套关系档。这些是<b className="text-gray-700">研究框架的梳理</b>,不是荐股、不是买卖建议。
        下面是每种关系、证据状态怎么读,以及为什么历史统计不等于预测。
      </p>

      {/* 关系档 */}
      <h2 className="mt-8 text-h2 font-semibold text-gray-900">关系档:一只票和产业链的关系</h2>
      <div className="mt-3 space-y-2.5">
        {RELATIONS.map((r) => (
          <div key={r.label} className="rounded-xl bg-white p-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Chip label={r.label} />
              <span className="text-xs text-gray-400">{r.who}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{r.desc}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-gray-400">
        排序权重:直接 &gt; 间接 &gt; 情绪 &gt; 弱。个股永远是「关系分级的说明性示例」,不是「推荐买入」。
      </p>

      {/* 证据状态 */}
      <h2 className="mt-8 text-h2 font-semibold text-gray-900">证据状态:这条关系有多少依据</h2>
      <div className="mt-3 space-y-2.5">
        {EVIDENCE.map((e) => (
          <div key={e.key} className="rounded-xl bg-white p-3.5 shadow-sm">
            <div className="text-sm font-semibold text-gray-800">{EVIDENCE_LABEL[e.key] ?? e.key}</div>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{e.desc}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-gray-400">
        direct 关系必须有一手披露入口(法定披露页)+ 验证点;我们只给「去哪核实、该核实什么」,不替你下结论。
      </p>

      {/* 历史统计 */}
      <h2 className="mt-8 text-h2 font-semibold text-gray-900">历史统计,为什么不是预测</h2>
      <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm leading-relaxed text-gray-600">
          「历史同向统计」= 过去某个海外触发源单日异动后,国内标的次日是否同向的历史比例。它只回答「过去有没有跟」,
          不回答「这次会不会跟」。
        </p>
        <ul className="mt-2.5 space-y-1 text-sm leading-relaxed text-gray-600">
          <li>· 它是<b className="text-gray-800">历史统计,非预测</b>;</li>
          <li>· 不代表未来会重复,历史规律不代表这次一定补涨;</li>
          <li>· 不构成投资建议;</li>
          <li>· 不等于产业链直接映射——同向率高不代表关系档就该升级。</li>
        </ul>
      </div>

      <p className="mt-8 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-400">
        StockTell 是 A 股散户的产业理解工具、不是荐股 / 喊单工具。所有关系为「研究框架梳理·非确认」,不构成投资建议。
        看具体产业链 → <Link href="/stocks" className="text-brand-600 hover:underline">产业链股票地图</Link>。
      </p>
    </div>
  );
}
