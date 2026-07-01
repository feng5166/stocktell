// 飞书自建应用机器人:发文本消息到指定用户(参照 cyberfate 反馈提醒)。
// 需环境变量:FEISHU_BOT_APP_ID / FEISHU_BOT_APP_SECRET / FEISHU_USER_OPEN_ID
// 未配置则静默跳过,不影响主流程。
export async function sendFeishu(
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const appId = process.env.FEISHU_BOT_APP_ID;
  const appSecret = process.env.FEISHU_BOT_APP_SECRET;
  const openId = process.env.FEISHU_USER_OPEN_ID;
  if (!appId || !appSecret || !openId) return { ok: false, error: "missing-env" };

  try {
    const tokenRes = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          app_id: appId,
          app_secret: appSecret,
        }).toString(),
      }
    );
    const tokenData = (await tokenRes.json()) as {
      code: number;
      tenant_access_token?: string;
    };
    if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
      console.error("[feishu] token error:", tokenData);
      return { ok: false, error: `token:${tokenData.code}` };
    }

    const sendRes = await fetch(
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
      }
    );
    const sendData = (await sendRes.json()) as { code: number; msg?: string };
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
