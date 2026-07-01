import { Resend } from "resend";

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
