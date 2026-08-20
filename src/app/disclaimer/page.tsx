import { SiteHeader } from "@/components/SiteHeader";

// 免责声明独立页(2026-07-09 SEO 底座五件套①):与 terms/privacy 同版式。
// 口径与 CLAUDE.md 三条铁律、DISCLAIMER 常量一致——只做产业链解释与关系梳理,不做投资建议。
export const metadata = {
  title: "免责声明 · StockTell",
  description:
    "StockTell 是产业链信息与研究框架工具:不构成投资建议、不推荐买卖、不预测涨跌;产业链关系为研究框架梳理·非确认;历史统计非预测。",
  alternates: { canonical: "/disclaimer" },
};

const UPDATED = "2026 年 7 月";

export default function DisclaimerPage() {
  return (
    <div className="site-atmosphere min-h-screen text-ink">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header>
          <h1 className="text-h1 font-semibold tracking-tight">免责声明</h1>
          <p className="mt-1 text-xs text-gray-400">最近更新:{UPDATED}</p>
        </header>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-gray-700">
          <Section title="1. 我们是什么,不是什么">
            StockTell 是一款<b>产业理解工具</b>:把全球公开事件拆解为产业链传导路径、A
            股关联映射与可核实的验证点。我们<b>不是</b>证券投资咨询机构,<b>不</b>提供荐股、买卖点位、目标价或涨跌预测,
            <b>不</b>代客理财,也<b>不</b>与任何上市公司存在付费推广关系。
          </Section>

          <Section title="2. 内容性质(重要)">
            站内全部内容——包括每日简报、链级推理、因果链深读、热力方向、个股关系档、验证点、历史复盘——
            <b>均为公开信息整理与研究框架梳理,不构成任何投资、财务、法律或税务建议,不构成任何证券的买卖要约或推荐。</b>
            所列个股仅为产业链关联的说明性示例;「直接映射 / 间接映射 / 情绪映射 / 待验证」是
            <b>关系强弱的研究分级(研究框架梳理 · 非确认)</b>,不代表经确认的客户、供应商或持仓关系,更不代表受益确定。
          </Section>

          <Section title="3. 「升温 / 降温」与历史统计的含义">
            热力方向表示<b>产业景气与业务暴露的研究判断</b>,不是股价涨跌预测;「历史同向统计」是对历史样本的回溯描述,
            <b>历史统计 · 非预测</b>,历史规律不代表未来表现。凡标注「待验证 / 低置信 / 推理假设」之处,表示证据尚不充分,请以公司公告与定期报告为准。
          </Section>

          <Section title="4. 信息来源与准确性">
            内容基于公开行情源、交易所法定披露渠道(巨潮资讯网、上海证券交易所等)与公开新闻事件,由自动化管线生成并经合规护栏与人工审阅流程处理。
            我们尽力保证准确与及时,但不对完整性、准确性、时效性作任何明示或默示担保;行情与数据可能存在延迟、缺失或第三方源错误。
          </Section>

          <Section title="5. 风险自担">
            证券市场有风险。您基于本站内容作出的任何决策及其后果,由您自行判断并独立承担。在做出任何投资决策前,请自行核实信息并在必要时咨询持牌专业人士。
          </Section>

          <Section title="6. AI 生成内容说明">
            部分内容由 AI 辅助生成并标注状态(如「模板兜底 · 低置信」)。AI 输出可能存在错误或遗漏;凡与交易所披露、公司公告不一致之处,以后者为准。
          </Section>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-gray-400">
          本页与《服务条款》《隐私政策》共同构成使用本站的完整约定。继续使用即表示您已阅读并理解上述声明。
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-sm font-semibold text-gray-900">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
