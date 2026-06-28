/* eslint-disable react/no-unescaped-entities */
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = {
  title: "关于我们 · StockTell",
  description:
    "StockTell:用 AI 把复杂的市场与产业链信息,翻译成普通散户能懂的解读。香港灵境智能科技(AuraAI Limited)出品。",
};

const TIMELINE = [
  ["2023.09", "Google 开发者大会 · 码力黑客松,优秀奖团队"],
  ["2023.10", "百川智能 × 亚马逊云科技 AI 黑客松,Awesome Star 特别奖"],
  ["2024.04", "钉钉(阿里)AI 助力大赛 高校 / 生活赛道,一等奖"],
  ["2024.12", "首款报告类产品「命之书」正式上线"],
  ["2025.04", "小红书首届独立开发大赛,最佳 AI 项目入围"],
  ["2025.07", "Adventure X(中国最大黑客松),评委及合作方"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9 first:mt-0">
      <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#1a1d24]">
      <SiteHeader active="关于我们" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">关于我们</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
          用 AI,把复杂的市场,翻译成你听得懂的人话。
        </p>

        <Section title="公司简介">
          <p>
            我们的旅程缘起于 2023 年的黑客松比赛,并于 2024 年正式成立
            <b>香港灵境智能科技有限公司(AuraAI Limited)</b>。作为一家创新的人工智能公司,我们一直在做同一件事:
            <b>用大型语言模型(LLM),把专业、复杂、零散的信息,翻译成普通人能听懂、用得上的解读。</b>
          </p>
          <p>
            最初,我们用 AI 重新解读东方玄学与命运;如今,我们把同样的理念带进资本市场,推出
            <b> StockTell</b> —— 一个面向 A 股散户的「AI 盯盘搭子」。我们相信,金融信息和命运一样,长期被"专业门槛"挡在普通人之外;而 AI 最擅长的,正是把这层门槛打薄。
          </p>
        </Section>

        <Section title="我们的使命">
          <p>
            让每一个普通散户,都能<b>看得懂行情背后的逻辑、不被情绪带着走、少踩坑</b>。
          </p>
          <p>
            我们不想让你坠入恐慌、盲目追涨杀跌,也不想让你一味依赖所谓"大神"的喊单。StockTell 想帮你做到的是
            <b> Be Your Own Investor —— 做自己投资的明白人</b>:把隔夜美股异动、产业链传导、基本面变化这些专业又零散的信息,翻译成"这跟你手里的票什么关系、你该怎么想",照亮你自己的判断。
          </p>
        </Section>

        <Section title="成长时间轴">
          <p>
            2023 年,一场黑客松让几个年轻人相遇。我们在各自的人生里都有过"尽力却依旧不如意"的时刻,因此格外想用技术,帮普通人把看不懂的东西看明白。
          </p>
          <ul className="mt-2 space-y-2">
            {TIMELINE.map(([date, text]) => (
              <li key={date} className="flex gap-3">
                <span className="shrink-0 font-mono text-sm text-amber-700">{date}</span>
                <span className="text-gray-700">{text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            从"解读命运"到"解读市场",变的是领域,不变的是我们对"把专业的事讲成人话"的执着。<span className="text-gray-400">未完待续……</span>
          </p>
        </Section>

        <Section title="我们的团队">
          <p>
            StockTell 的团队成员背景多元:既有来自顶尖学府和知名大厂,也有来自普通院校、小型创业公司,还有人经历过延期毕业、休学。这些经历塑造了我们 —— 坦然面对过去,脚踏实地,专注当下,不美化未曾走过的路。团队分布在全球各地,境内多在长三角,其余多在东南亚与北美;对大多数成员而言,这并不是第一个创业项目。
          </p>
          <p>
            <b>创始人兼 CEO · Levy Cheng</b> 毕业于香港科技大学,职业经历丰富:曾任 Lanternfish 首席运营官(用人工智能帮律师事务所降低时间与人力成本),也曾是字节跳动 Lark 产品的产品经理。近年来,他将大型人工智能模型先后应用于文化研究、心理学,以及如今的<b>金融信息解读 —— 帮普通散户看懂市场</b>。
          </p>
        </Section>

        <Section title="把专业金融分析与 AI 融合">
          <p>
            投资研究本质上是一条<b>建立在严谨逻辑链上的推理</b>:美股为什么动 → 产业链如何传导 → 哪些 A 股受益或承压 → 当前定价是否合理。这种"链式推理"天然适合用先进的推理模型来增强。我们汲取专业分析师的领域知识,构建产业链知识图谱,并用人工精标的推理链数据做模型蒸馏与微调,在保持专业严谨的同时,把模型幻觉率维持在较低水平。
          </p>
          <p>
            更重要的是,我们坚持<b>优先提供情感价值,而不是制造焦虑与恐慌</b>。盯盘最怕被情绪牵着走,所以 StockTell 更像一个懂行、靠谱、会说人话的搭子:主动陪你、提醒你别踩坑,而不是冷冰冰地报涨跌、或用"暴跌""崩盘"吓你。为此我们打磨了 AI 的语言风格与界面体验,并持续打造更自然的对话式解读与场景化能力。
          </p>
          <p className="text-sm text-gray-500">
            (团队此前的产品在几乎没有大规模营销的情况下,仅凭口碑就积累了超过 2 万名注册用户,并被香港信报、MIT Tech、南风窗、财经杂志、36Kr 等多家媒体报道。)
          </p>
        </Section>

        <p className="mt-10 border-t border-gray-200 pt-4 text-xs text-gray-400">
          以上为公司介绍与信息整理,不构成投资建议。投资有风险,决策需谨慎。
        </p>
      </main>
    </div>
  );
}
