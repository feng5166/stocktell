import { Resend } from "resend";

// 邮件全局暂停开关(发件域验证失效期,负责人拍板『先维持』,见 digest.ts 头部背景注释)。
// 放 mailer 层而非 digest:它的语义是"发件域坏了、全量被拒",覆盖对象是所有【定时批量】
// 邮件(早报 digest + 雷区提醒),不只早报 —— 此前只挡 digest,雷区邮件仍在往失效域发、
// 白积 Resend 硬退(2026-07-30 review)。定时任务各自在发送前查它;密码重置/后台手动测试
// 这类一次性邮件刻意不挡(量小,且排障时需要能实际发一封)。
export const emailDigestPaused = () => process.env.EMAIL_DIGEST_PAUSED === "1";

// 邮件 HTML 模板插值转义(单一来源,2026-07-30 review):LLM 产出/Tushare 文本/新闻标题里
// 出现 <>& 会破版(admin/email-push 早有局部 esc(),digest/risk-radar 此前是裸插值)。
// 只转义动态文本,模板骨架照旧。
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface MailOpts {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>; // 如 List-Unsubscribe(邮件客户端原生退订)
}

// 带详情的发信:返回 { ok, error?, id? },便于后台排查失败原因(抑制名单/无效地址/限流…)。
export async function sendMailResult(
  opts: MailOpts
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[mail 降级] → ${opts.to}: ${opts.subject}`);
    return { ok: false, error: "no-resend-key" };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || "StockTell <onboarding@resend.dev>";
  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      ...(opts.headers ? { headers: opts.headers } : {}),
    });
    if (error) {
      console.error("[mail] resend error:", error);
      const e = error as { name?: string; message?: string };
      return {
        ok: false,
        error: `${e.name ?? "error"}: ${e.message ?? JSON.stringify(error)}`,
      };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error("[mail] exception:", e);
    return { ok: false, error: `exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// 统一发信:未配 RESEND_API_KEY 时降级打印、返回 false,绝不抛错中断主流程
export async function sendMail(opts: MailOpts): Promise<boolean> {
  return (await sendMailResult(opts)).ok;
}
