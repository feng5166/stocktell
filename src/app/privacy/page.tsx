import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "隐私政策 · StockTell",
  description: "StockTell 隐私政策",
};

const UPDATED = "2026 年 6 月";

export default function PrivacyPage() {
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
        <h1 className="text-h1 font-semibold tracking-tight">隐私政策</h1>
        <p className="mt-1 text-xs text-gray-400">最近更新:{UPDATED}</p>

        <div className="mt-6 space-y-6 text-sm leading-relaxed text-gray-700">
          <Section title="1. 我们收集的信息">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b>你主动提供的</b>:注册邮箱;密码(以加密哈希形式存储,我们无法看到明文);
                使用 Google 登录时,Google 提供的昵称与头像。
              </li>
              <li>
                <b>你的使用数据</b>:你添加的自选/关注股票列表。
              </li>
              <li>
                <b>自动产生的</b>:用于维持登录状态的会话信息,以及基础的访问日志。
              </li>
            </ul>
          </Section>

          <Section title="2. 我们如何使用这些信息">
            用于:创建与维护你的账号、保持登录状态、提供个性化的“和我相关”与自选功能、在你请求时发送密码重置邮件,以及在你开启时发送相关提醒。
          </Section>

          <Section title="3. 游客模式(不登录)">
            未登录使用时,你添加的自选仅保存在<b>你自己浏览器的本地存储(localStorage)</b>中,不会上传到我们的服务器;登录后才会同步到你的账号。
          </Section>

          <Section title="4. 第三方服务">
            为提供服务,部分数据会经由以下第三方处理:
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <b>Google</b>:用于第三方登录(OAuth),仅在你选择使用时。
              </li>
              <li>
                <b>Vercel、Neon(Postgres)</b>:应用托管与数据库存储。
              </li>
              <li>
                <b>行情、新闻检索与大模型服务</b>:用于生成行情、简报与“为什么动”等内容。
                <b>我们不会将你的个人身份信息(邮箱等)发送给这些内容生成服务。</b>
              </li>
              <li>
                <b>邮件 / 消息服务</b>:用于发送密码重置与提醒通知。
              </li>
            </ul>
          </Section>

          <Section title="5. Cookie 与会话">
            我们使用必要的 Cookie 来维持你的登录会话。除此之外不用于第三方广告追踪。
          </Section>

          <Section title="6. 数据存储与安全">
            你的数据存储于 Vercel Postgres(底层 Neon)。密码以 bcrypt 哈希存储,任何人(包括我们)都无法还原其明文。我们采取合理措施保护你的数据,但请理解互联网传输无法保证绝对安全。
          </Section>

          <Section title="7. 你的权利">
            你可以随时查看与修改你的自选;如需删除账号及相关数据,请通过下方邮箱联系我们,我们将在合理期限内处理。
          </Section>

          <Section title="8. 未成年人">
            本服务面向年满 18 周岁的用户。我们不会有意收集未成年人的个人信息。
          </Section>

          <Section title="9. 政策变更">
            本隐私政策可能不时更新,更新后将在本页公布,并更新顶部的“最近更新”日期。
          </Section>

          <Section title="10. 联系我们">
            如对你的隐私或本政策有任何疑问,请联系:
            <a href="mailto:support@stocktell.me" className="text-brand-600 underline">
              support@stocktell.me
            </a>
            。
          </Section>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          另见{" "}
          <Link href="/terms" className="text-brand-600 hover:underline">
            服务条款
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
      <div>{children}</div>
    </section>
  );
}
