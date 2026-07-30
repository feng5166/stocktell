import Link from "next/link";

// 全局页脚:给所有用户(不止管理员)一个稳定的法务/关于入口 + 常驻免责。
// 挂在根布局,SiteHeader 覆盖的页面底部都有。文字用 gray-500 保证对比度可读(AA)。
export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-5xl px-4 pb-8 pt-6 text-center">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-meta text-gray-500">
        <Link href="/chains" className="hover:text-gray-700">
          产业链总览
        </Link>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <Link href="/daily" className="hover:text-gray-700">
          简报归档
        </Link>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <Link href="/methodology?from=footer" className="hover:text-gray-700">
          数据与方法
        </Link>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <Link href="/pro" className="hover:text-gray-700">
          专业版(规划中)
        </Link>
        <Link href="/about" className="hover:text-gray-700">
          关于我们
        </Link>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <Link href="/privacy" className="hover:text-gray-700">
          隐私政策
        </Link>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <Link href="/disclaimer" className="hover:text-gray-700">
          免责声明
        </Link>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <Link href="/terms" className="hover:text-gray-700">
          服务条款
        </Link>
      </nav>
      <p className="mt-2 text-meta leading-relaxed text-gray-500">
        StockTell 的内容均为 AI 对公开信息的整理与解读,不构成投资建议。
      </p>
      {/* 备案信息(2026-07-30,stocktell.me 切回主域后按规定悬挂):
          ICP 备案号按工信部要求链接 beian.miit.gov.cn;公安备案号链接公安部备案查询页
          (beian.mps.gov.cn 新版入口,带编号参数直达查询)。备案主体见 relation-changelog 同日记录。
          公安备案的官方小盾牌图标素材需从公安备案平台下载,后补不影响合规主体(号+链接已达标)。
          vercel.app / maoadao 域名下同样渲染此行:规定只要求备案域名悬挂,多挂无害,不做按域名条件渲染。 */}
      <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-meta text-gray-400">
        <a
          href="https://beian.miit.gov.cn"
          target="_blank"
          rel="noreferrer nofollow"
          className="hover:text-gray-600"
        >
          浙ICP备2026050677号-2
        </a>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=11010502061873"
          target="_blank"
          rel="noreferrer nofollow"
          className="hover:text-gray-600"
        >
          京公网安备11010502061873号
        </a>
      </p>
    </footer>
  );
}
