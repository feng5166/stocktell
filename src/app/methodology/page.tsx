import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { MethodologyView } from "@/components/MethodologyView";

// 数据来源与方法(PRD prd-trust-chat-pro-intent §4 · PR2)。
// 公开产品说明页,回答:数据来自哪里、多久更新、AI 做什么、人工做什么、怎么判断证据、哪里可能错。
// 【铁律:所有事实以运行代码为准】——本页每条数据源描述都对应真实实现(见各节行内注释),
// 改数据源(quotes.ts / yahoo.ts / tushare.ts / bocha.ts / llm*)必须同步改本页 + EXTERNAL_SERVICES.md。
// 静态页(SSG);入口埋点 methodology_view 由 client 组件读 ?from= 上报,不破坏静态化。
export const metadata: Metadata = {
  title: "数据来源与方法 · StockTell",
  description:
    "StockTell 的数据来自哪里、多久更新、AI 负责什么、人工负责什么、怎么读 References 与证据状态,以及产品边界:不荐股、不预测涨跌、不构成投资建议。",
  alternates: { canonical: "/methodology" },
};

function Section({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-h2 font-semibold text-gray-900">
        <span className="mr-1.5 text-gray-300">{no}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

const STEP_FLOW = [
  "隔夜美股异动 / 全球事件触发(每个交易日盘前自动捕获)",
  "归入产业链:触发源与受益标的按人工校准的关系档归属到具体链与环节",
  "生成链级判断与热力:LLM 负责归纳表述,方向有规则兜底;环节与关系永远来自链配置,不由 AI 临时决定",
  "映射 A 股:关系档优先取人工核定的关系模型;个别未逐票核定的,按其所在环节的默认档标注(偏保守,如情绪映射)——两种来源都是预先配置,不由 AI 临时决定",
  "绑定来源:引用只来自真实检索结果或人工录入,链接经可达性实测;AI 不允许自己编 URL",
  "护栏检查:结构校验 + 禁词 / 具体涨跌数字红线,不过即拦下,不发布",
  "发布与复盘:发布后当日收盘自动记账,验证结果回流人工复核队列",
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <MethodologyView />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-h1 font-semibold tracking-tight text-gray-900">数据来源与方法</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          这页回答五个问题:数据来自哪里、多久更新一次、AI 负责什么、人工负责什么、哪里可能出错。
          我们不要求你信任结论,只保证每个结论都能顺着来源往回查。
        </p>

        <Section no="01" title="一条推理是怎么形成的">
          <ol className="space-y-1.5">
            {STEP_FLOW.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 font-mono text-xs leading-6 text-gray-300">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section no="02" title="实时行情">
          {/* 事实来源:src/lib/quotes.ts(腾讯主/新浪补/DB 缓存)、us-indices 段(Yahoo 主) */}
          <p>
            A 股与美股个股实时行情:<b className="text-gray-700">腾讯行情为主源,新浪补缺</b>;
            两者都失败时显示数据库缓存的最近一次行情。美股大盘指数(纳指 / 标普 / 费半):
            <b className="text-gray-700">Yahoo Finance 为主</b>,新浪 / 腾讯补缺。
          </p>
          <p className="text-xs text-gray-500">
            所以极端情况下页面可能显示的是缓存行情——以页面标注的实际数据时间(asOf)为准,我们不假装它是实时的。
          </p>
        </Section>

        <Section no="03" title="金融数据">
          {/* 事实来源:src/lib/tushare.ts 及 risk-radar/financials/similarity */}
          <p>
            交易日历、基本面(市值 / 换手 / PE)、资金面、雷区雷达(解禁 / 增减持 / 质押 / 回购 / ST)、
            财报体检与历史相似性,来自 <b className="text-gray-700">Tushare</b>。
            各模块更新频率不同:行情类当日更新,基本面 / 概念归属等静态增强数据每周刷新,
            <b className="text-gray-700">不承诺全站实时</b>。
          </p>
          <p>
            首页“AI 链内资金状态”的口径是:
            <b className="text-gray-700">链内净额/成交比 = 核定成分股主力净额合计 ÷ 同日成交额合计 × 100%</b>。
            它只用于观察 StockTell 核定样本的链内资金方向,不代表全市场板块排名;“同向 / 分叉”只比较同日价格与资金方向。
            资金是市场行为,不能替代订单、收入、客户等产业证据。
          </p>
        </Section>

        <Section no="04" title="事件与新闻">
          {/* 事实来源:src/lib/bocha.ts——检索不到可核实材料时调用方降级,不编造 */}
          <p>
            公开网页检索由<b className="text-gray-700">博查搜索</b>负责。
            「为什么动」等解释类内容<b className="text-gray-700">只在检索到可核实材料时才生成</b>——
            搜不到可靠来源,就明确不给原因,而不是让 AI 编一个。
          </p>
        </Section>

        <Section no="05" title="产业链关系从哪来">
          <p>
            每只股票和产业链的关系(直接映射 / 间接映射 / 情绪映射 / 弱映射 / 待验证 / 触发源)是一套
            <b className="text-gray-700">经人工校准的研究框架</b>,不是 AI 临时生成的。
            直接与间接映射必须带公开披露入口和验证点;改动关系档要走代码评审,每日行情信号不会自动改档。
          </p>
          <p>
            各档位的具体含义见
            <Link href="/relations" className="mx-0.5 text-brand-600 hover:underline">
              关系说明
            </Link>
            。
          </p>
        </Section>

        <Section no="06" title="AI 做什么,人工做什么">
          {/* 事实来源:insight-pipeline generate/guard/schema + 审阅台;LLM=ModelVerse 主/DeepSeek 兜底 */}
          <p>
            <b className="text-gray-700">AI 负责</b>:归纳表述(链级判断、风险提示的文字)、候选推理。
            <b className="text-gray-700">AI 不负责</b>:映射哪些股票、关系档位、引用链接——股票与关系来自人工核定的关系模型
            (未逐票核定的按环节默认档保守标注),引用链接只来自真实检索或人工录入;三者都不由 AI 临时生成。
          </p>
          <p>
            所有生成内容发布前经过:结构校验 → 禁词与具体涨跌数字护栏 → 发布规则(AI 生成内容的置信度上限是「中」,
            「高」只能由人工审阅给出);疑似退化的内容不自动发布,留人工审。关系升级永远需要人工评审。
          </p>
        </Section>

        <Section no="07" title="怎么读 References" >
          <p>页面里每条引用会标四类信息,含义如下:</p>
          <ul className="space-y-1.5">
            <li>
              · <b className="text-gray-700">具体来源 vs 常设入口</b>:前者是一份真实材料(财报 / 公告 / 报道),
              后者是「去哪核实」的官方长期页面——常设入口<b className="text-gray-700">不代表已证明具体结论</b>。
            </li>
            <li>
              · <b className="text-gray-700">核实状态</b>:「已核实可达」只代表链接实测打得开、材料真实存在;
              「当前不可达」保留名称与状态,不删历史证据;「待验证」是有材料但未做可达探测。
            </li>
            <li>
              · <b className="text-gray-700">来源角色</b>:事实来源 / StockTell 推理 / 推理假设——
              没有引用支撑的判断会明确标「推理假设 · 待验证」,不用空白掩盖。
            </li>
            <li>
              · <b className="text-gray-700">结论置信度</b>(高 / 中 / 低)与链接是否可达是两回事:
              材料存在 ≠ 我们的推论必然成立。
            </li>
          </ul>
        </Section>

        <Section no="08" title="更新时间与局限">
          {/* 事实来源:vercel.json cron(07:00 briefing / 07:07 insight / 15:30·17:30 outcome)+ 周六数据周更 */}
          <ul className="space-y-1.5">
            <li>· 盘前简报:每个 A 股交易日早上约 07:00 生成;美股休市时如实标注,不硬造隔夜内容。</li>
            <li>· 链级每日推理:紧随简报(约 07:07)逐链生成,发布后当日收盘自动记账复盘。</li>
            <li>· 静态增强数据(市值 / 概念 / ETF 持仓):每周六自动刷新。</li>
            <li>· AI 链内资金状态:使用 Tushare 收盘日频数据,随最新完整资金交易日更新,不标成盘中实时。</li>
            <li>
              · 页面时间口径:AI 判断标实际发布时间;实时行情标“截至”,断连回放标“缓存截至”,日频数据标交易日“收盘”。静态产业链骨架是长期研究框架,不伪造实时更新时间。
            </li>
            <li>
              · <b className="text-gray-700">历史归档保留当日判断原文,不随后市改写</b>——判断错了就让它错着,这是复盘的前提。
            </li>
            <li>· 已知局限:行情源偶发抖动时可能降级到缓存;检索覆盖不了的事件不会出现在推理里。</li>
          </ul>
        </Section>

        <Section no="09" title="产品边界">
          <p>
            StockTell <b className="text-gray-700">不提供</b>:买卖建议、目标价、涨跌预测、仓位建议。
            所有个股都是「关系分级的说明性示例」;所有关系是「研究框架梳理 · 非确认」。
            内容为 AI 对公开信息的整理与解读,<b className="text-gray-700">不构成投资建议</b>。
          </p>
        </Section>

        <p className="mt-8 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-400">
          相关阅读:
          <Link href="/relations?from=methodology" className="mx-1 text-brand-600 hover:underline">
            关系说明
          </Link>
          ·
          <Link href="/about" className="mx-1 text-brand-600 hover:underline">
            关于我们
          </Link>
          ·
          <Link href="/disclaimer" className="mx-1 text-brand-600 hover:underline">
            免责声明
          </Link>
        </p>
      </main>
    </div>
  );
}
