// 一次性登录:取 iLink 二维码 → 用微信扫码确认 → 拿到 bot_token 存 token.json
// 零依赖:打印二维码内容链接(部署者把它转成二维码扫描)
import fs from "fs";

const BASE = "https://ilinkai.weixin.qq.com";

const q = await fetch(`${BASE}/ilink/bot/get_bot_qrcode?bot_type=3`).then((r) => r.json());
if (q.ret !== 0) {
  console.error("取二维码失败:", q);
  process.exit(1);
}
console.log("QRCODE_URL=" + q.qrcode_img_content);
console.log("等待扫码确认…");

while (true) {
  await new Promise((s) => setTimeout(s, 2000));
  const st = await fetch(`${BASE}/ilink/bot/get_qrcode_status?qrcode=${q.qrcode}`)
    .then((r) => r.json())
    .catch(() => ({}));
  if (st.bot_token) {
    fs.writeFileSync(
      "token.json",
      JSON.stringify({ bot_token: st.bot_token, baseurl: st.baseurl || BASE }, null, 2)
    );
    console.log("LOGIN_OK token.json 已生成");
    break;
  }
}
