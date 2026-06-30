import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "服务条款 · StockTell",
  description: "StockTell 服务条款",
};

const UPDATED = "2026 年 6 月";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label="StockTell 首页">
            <Logo className="h-6 w-auto" />
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
            ← 返回首页
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-h1 font-semibold tracking-tight">服务条款</h1>
        <p className="mt-1 text-xs text-gray-400">最近更新:{UPDATED}</p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-gray-700">
          <Section title="1. 关于本服务">
            StockTell(以下简称“本服务”)是一款面向个人投资者的 AI
            产业链信息工具,提供公开信息的整理、行情展示、每日简报与个性化关注等功能。使用本服务即表示您已阅读、理解并同意本条款。
          </Section>

          <Section title="2. 不构成投资建议(重要)">
            本服务的所有内容——包括但不限于简报、“散户怎么想”、产业链映射、联动差异、联动复盘、“为什么动”等——
            <b>均为公开信息整理与观点参考,不构成任何投资、财务、法律或税务建议,也不构成任何证券的买卖要约或推荐。</b>
            投资有风险,任何投资决策及其盈亏由您自行判断并承担。历史规律不代表未来表现;
            产业链关系为研究框架梳理,非经确认的客户/供应商/持仓关系。
          </Section>

          <Section title="3. 账号与资格">
            您需年满 18
            周岁方可注册使用。您应对账号下的活动及密码安全负责,并保证提供真实有效的信息。请勿与他人共享账号或冒用他人身份。
          </Section>

          <Section title="4. 可接受的使用">
            您同意不以任何方式滥用本服务,包括但不限于:批量爬取数据、对系统进行攻击或干扰、逆向工程、未经授权的商业转售或再分发。
          </Section>

          <Section title="5. 数据来源与准确性">
            本服务的行情、新闻、财务等数据来自第三方来源,内容可能存在延迟、不准确或不完整;本服务不对其及时性、准确性或完整性作任何保证。
          </Section>

          <Section title="6. 知识产权">
            本服务的页面设计、文案、聚合与编排成果归本服务所有。未经书面许可,不得复制、抓取或用于商业用途。
          </Section>

          <Section title="7. 服务变更与终止">
            我们可能随时新增、修改、暂停或终止部分或全部功能。对于违反本条款的账号,我们有权限制或终止其使用。
          </Section>

          <Section title="8. 责任限制">
            在适用法律允许的最大范围内,对于因使用或无法使用本服务而导致的任何投资损失或间接损失,本服务不承担责任。
          </Section>

          <Section title="9. 条款变更">
            本条款可能不时更新,更新后将在本页公布。您在更新后继续使用本服务,即视为接受修订后的条款。
          </Section>

          <Section title="10. 联系我们">
            如对本条款有任何疑问,请联系:
            <a href="mailto:support@stocktell.me" className="text-brand-600 underline">
              support@stocktell.me
            </a>
            。
          </Section>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          另见{" "}
          <Link href="/privacy" className="text-brand-600 hover:underline">
            隐私政策
          </Link>
        </p>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1.5 text-h2 font-semibold text-gray-900">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
