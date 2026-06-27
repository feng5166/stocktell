# StockTell iLink 微信推送桥(简易自建 WxPusher)

直连腾讯官方 **iLink 协议**(`ilinkai.weixin.qq.com`)给微信用户发推送。
对接 StockTell 现有代码:`bind-weixin` 由本桥回调,`push-weixin` 通过 `CLAWBOT_API_URL` 调本桥 `/send`。

## 它做两件事
1. **收消息(绑定)**:长轮询 `getupdates`,收到用户发的绑定码 → 调 StockTell `/api/push/bind-weixin`(把用户 `xxx@im.wechat` 当 openId)
2. **发消息**:暴露 `POST /send {openId,text}`,转成 iLink `sendmessage` 发到用户微信

## 跑起来(需一台常驻机器 + 一个微信号)
```bash
cd ilink-bridge
npm install
npm run login          # 出二维码 → 用微信扫码确认(这个微信号当 bot)→ 生成 token.json
BRIDGE_SECRET=xxx STOCKTELL_BASE=https://stocktell.vercel.app npm start
```
`BRIDGE_SECRET` 要和 StockTell Vercel 的 `CLAWBOT_SECRET` 一致。

## 接到 StockTell
桥要有**公网地址**(给 Vercel 调)。本地可用 `cloudflared tunnel --url http://localhost:8787` 暴露,拿到公网 URL 后,在 Vercel 设:
```
CLAWBOT_API_URL = https://<公网地址>/send
CLAWBOT_SECRET  = <与 BRIDGE_SECRET 相同>
```

## ⚠️ 必须先验证的关键点(make-or-break)
iLink 发消息要带用户的 `context_token`(本桥已自动存每个用户最近的)。
**主动推送(用户当天没先发消息)能不能发、隔夜 token 还有没有效——文档没写死,必须实测:**
绑定一个测试用户 → 等几小时/隔天 → 调 `/send` 看能不能收到。
- 能 → iLink 直连方案成立,日推可用
- 不能(只能在用户发消息后的窗口内回复) → iLink 不适合"每日主动推送",改用 WxPusher 或微信服务号模板消息

## 部署常驻的选择
- 你常开的 Mac / 小 VPS:`npm start`(配 pm2/systemd 守护)
- Railway / Render / Fly:作为 worker 服务常驻,设环境变量即可
