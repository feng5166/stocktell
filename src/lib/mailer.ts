import { Resend } from "resend";

// 统一发信:未配 RESEND_API_KEY 时降级打印、返回 false,绝不抛错中断主流程
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>; // 如 List-Unsubscribe(邮件客户端原生退订)
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[mail 降级] → ${opts.to}: ${opts.subject}`);
    return false;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || "StockTell <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    ...(opts.headers ? { headers: opts.headers } : {}),
  });
  if (error) {
    console.error("[mail] resend error:", error);
    return false;
  }
  return true;
}
