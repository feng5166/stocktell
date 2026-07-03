// 飞书自建应用机器人:发文本消息到指定用户(参照 cyberfate 反馈提醒)。
// 需环境变量:FEISHU_BOT_APP_ID / FEISHU_BOT_APP_SECRET / FEISHU_USER_OPEN_ID
// 未配置则静默跳过,不影响主流程。
import { fetchJsonWithTimeout } from "@/lib/fetch-timeout";

// 超时覆盖 fetch + body 读全程(用共享 fetchJsonWithTimeout):飞书是告警通道,
// 它挂起时若只 abort 头、不管 body 读,会把看门狗拖到 maxDuration 被硬杀 = 故障无人知(告警的告警)。
const FEISHU_TIMEOUT_MS = 6000;

export async function sendFeishu(
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const appId = process.env.FEISHU_BOT_APP_ID;
  const appSecret = process.env.FEISHU_BOT_APP_SECRET;
  const openId = process.env.FEISHU_USER_OPEN_ID;
  if (!appId || !appSecret || !openId) return { ok: false, error: "missing-env" };

  try {
    const tokenData = await fetchJsonWithTimeout<{
      code: number;
      tenant_access_token?: string;
    }>(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ app_id: appId, app_secret: appSecret }).toString(),
      },
      FEISHU_TIMEOUT_MS
    );
    if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
      console.error("[feishu] token error:", tokenData);
      return { ok: false, error: `token:${tokenData.code}` };
    }

    const sendData = await fetchJsonWithTimeout<{ code: number; msg?: string }>(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.tenant_access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          receive_id: openId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        }),
      },
      FEISHU_TIMEOUT_MS
    );
    if (sendData.code !== 0) {
      console.error("[feishu] send error:", sendData);
      return { ok: false, error: `send:${sendData.code}:${sendData.msg ?? ""}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[feishu] exception:", e);
    return { ok: false, error: `exception:${e instanceof Error ? e.message : String(e)}` };
  }
}

// 北京时间字符串
export function beijingTime(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
