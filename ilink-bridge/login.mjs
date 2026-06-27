// 一次性登录:取 iLink 二维码 → 你用微信扫码确认 → 拿到 bot_token 存 token.json
import fs from "fs";
import qrcode from "qrcode-terminal";

const BASE = "https://ilinkai.weixin.qq.com";

const q = await fetch(`${BASE}/ilink/bot/get_bot_qrcode?bot_type=3`).then((r) => r.json());
if (q.ret !== 0) {
  console.error("取二维码失败:", q);
  process.exit(1);
}
console.log("\n用【微信】扫描下面二维码并确认登录(这个微信号将作为推送 bot):\n");
qrcode.generate(q.qrcode_img_content, { small: true });
console.log("\n(扫不出来就把这个链接生成二维码扫:" + q.qrcode_img_content + ")\n等待确认…");

while (true) {
  await new Promise((s) => setTimeout(s, 2000));
  const st = await fetch(
    `${BASE}/ilink/bot/get_qrcode_status?qrcode=${q.qrcode}`
  ).then((r) => r.json()).catch(() => ({}));
  if (st.bot_token) {
    fs.writeFileSync(
      "token.json",
      JSON.stringify({ bot_token: st.bot_token, baseurl: st.baseurl || BASE }, null, 2)
    );
    console.log("\n✅ 登录成功,bot_token 已存到 token.json。现在可以 `npm start` 跑桥接。");
    break;
  }
  process.stdout.write(".");
}
