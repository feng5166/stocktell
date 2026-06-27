// StockTell 微信推送桥(多租户版 / iLink)
// 绑定:每个用户扫自己的码 → 拿 bot_token + ilink_user_id(自动归属发起绑定的账号)
//       → 用户发一句话 → 抓到 context_token → 激活
// 推送:POST /send {openId,text} → 按 openId 取该用户的 {botToken, contextToken} 发送
//
// 端点(除 /health 外都要 x-clawbot-secret):
//   POST /bind/start {accountId}        → {qrcode, qrImg, botType}
//   POST /bind/poll  {qrcode}           → {state: pending|scanned|activated|expired, openId?}
//   POST /send       {openId,text}      → {ok,...}
//   POST /unbind     {openId}           → {ok}
//   GET  /users                         → 已绑用户列表(管理用)
//   GET  /health
import http from "http";
import fs from "fs";
import crypto from "crypto";

const ILINK = "https://ilinkai.weixin.qq.com";
const SECRET = process.env.BRIDGE_SECRET || "";
const STOCKTELL = process.env.STOCKTELL_BASE || "https://www.stocktell.me";
const PORT = process.env.PORT || 8787;

// 持久化:每个微信用户的凭证
const CREDS_FILE = "creds.json";
let creds = fs.existsSync(CREDS_FILE) ? JSON.parse(fs.readFileSync(CREDS_FILE, "utf8")) : {};
const saveCreds = () => fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));

// 进行中的绑定(内存即可):qrcode -> {accountId, state, openId, botToken, createdAt}
const pending = new Map();
// 每个用户的 getupdates worker 运行标记:openId -> {stop}
const workers = new Map();

const nowSec = () => Math.floor(Date.now() / 1000);
const clientId = () => "stocktell-weixin:" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
function ihdr(botToken) {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": Buffer.from(String(Math.floor(Math.random() * 0xffffffff))).toString("base64"),
    Authorization: `Bearer ${botToken}`,
  };
}

async function ilinkSend(botToken, toUserId, contextToken, text) {
  const body = {
    msg: {
      from_user_id: "",
      to_user_id: toUserId,
      client_id: clientId(),
      message_type: 2,
      message_state: 2,
      context_token: contextToken || "",
      item_list: [{ type: 1, text_item: { text } }],
    },
    base_info: { channel_version: "1.0.2" },
  };
  const r = await fetch(`${ILINK}/ilink/bot/sendmessage`, {
    method: "POST",
    headers: ihdr(botToken),
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  let d = {};
  try { d = JSON.parse(raw); } catch {}
  const ok = r.ok && (d.ret === undefined || d.ret === 0);
  if (!ok) console.error(`[bridge] 发送失败 to=${toUserId} http=${r.status} body=${raw}`);
  return { ok, ret: d.ret, http: r.status };
}

// 单用户 getupdates 循环:保持 context_token 最新 + 处理「解绑」
async function startWorker(openId) {
  if (workers.has(openId)) return; // 已在跑
  const w = { stop: false };
  workers.set(openId, w);
  let buf = "";
  console.log(`[bridge] worker 启动 ${openId}`);
  (async () => {
    while (!w.stop && creds[openId]) {
      try {
        const r = await fetch(`${ILINK}/ilink/bot/getupdates`, {
          method: "POST",
          headers: ihdr(creds[openId].botToken),
          body: JSON.stringify({ get_updates_buf: buf, base_info: { channel_version: "1.0.2" } }),
        });
        const d = await r.json();
        if (d.get_updates_buf) buf = d.get_updates_buf;
        for (const m of d.msgs || []) {
          if (m.context_token && creds[openId]) {
            creds[openId].contextToken = m.context_token;
            creds[openId].lastMsgAt = nowSec();
            saveCreds();
          }
          const text = (m.item_list || []).map((i) => i.text_item?.text).filter(Boolean).join("").trim();
          if (text === "解绑" || /^unbind$/i.test(text)) {
            await ilinkSend(creds[openId].botToken, openId, m.context_token, "已为你关闭 StockTell 微信推送。重新在 stocktell.me 扫码可再次开启。");
            await stockTell("/api/push/unbind-weixin", { openId });
            removeUser(openId);
            return;
          }
        }
      } catch (e) {
        console.error(`[bridge] worker ${openId} err: ${e.message}`);
        await new Promise((s) => setTimeout(s, 3000));
      }
    }
    console.log(`[bridge] worker 退出 ${openId}`);
    workers.delete(openId);
  })();
}

function removeUser(openId) {
  const w = workers.get(openId);
  if (w) w.stop = true;
  delete creds[openId];
  saveCreds();
}

async function stockTell(path, payload) {
  try {
    const r = await fetch(`${STOCKTELL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-clawbot-secret": SECRET },
      body: JSON.stringify(payload),
    });
    return await r.json().catch(() => ({}));
  } catch { return {}; }
}

// 绑定轮询:盯 pending 里待扫码的码;扫到就建 creds + 起 worker 等激活
async function bindWatcher() {
  while (true) {
    await new Promise((s) => setTimeout(s, 2000));
    for (const [qrcode, p] of pending) {
      // 清理超时(10 分钟)
      if (nowSec() - p.createdAt > 600) { pending.delete(qrcode); continue; }
      if (p.state === "pending") {
        const st = await fetch(`${ILINK}/ilink/bot/get_qrcode_status?qrcode=${qrcode}`).then((r) => r.json()).catch(() => ({}));
        if (st.status === "expired") { p.state = "expired"; continue; }
        if (st.bot_token && st.ilink_user_id) {
          const openId = st.ilink_user_id;
          p.openId = openId;
          p.botToken = st.bot_token;
          p.state = "scanned";
          // 换绑/重绑:若该微信已绑别的记录,覆盖为最新
          const prev = workers.get(openId);
          if (prev) prev.stop = true;
          creds[openId] = {
            accountId: p.accountId,
            botToken: st.bot_token,
            ilinkBotId: st.ilink_bot_id,
            contextToken: creds[openId]?.contextToken || null,
            boundAt: creds[openId]?.boundAt || nowSec(),
          };
          saveCreds();
          console.log(`[bridge] 扫码确认 account=${p.accountId} openId=${openId}`);
          startWorker(openId);
        }
      } else if (p.state === "scanned") {
        // 等用户发第一条消息拿到 contextToken → 激活
        if (creds[p.openId]?.contextToken) {
          p.state = "activated";
          console.log(`[bridge] 激活 openId=${p.openId}`);
          // 落库:让 StockTell 把该账号的 weixinOpenId 设好(以 accountId 为准)
          await stockTell("/api/push/bind-weixin-direct", { accountId: p.accountId, openId: p.openId });
          // 发欢迎语确认绑定
          await ilinkSend(
            creds[p.openId].botToken,
            p.openId,
            creds[p.openId].contextToken,
            [
              "🎯 欢迎加入 StockTell —— 你的 A 股「盯盘搭子」",
              "",
              "我专门帮你盯盘:每天早上 8 点扫一遍市场,把 AI 产业链等热点,翻译成「对你自选股到底意味着什么」——只在你关注的票真有动静时才提醒,没动静的日子绝不打扰。",
              "",
              "每条提醒都讲清楚:",
              "• 哪只票、涨还是跌",
              "• 为什么动(背后的产业链逻辑)",
              "• 对你是利好还是利空",
              "",
              "下一步:",
              "1️⃣ 去 stocktell.me 把自选股加上",
              "2️⃣ 明早 8 点开始收提醒",
              "",
              "💬 小提示:微信规定你得每天来发句话(随便发),我的提醒才进得来;发「解绑」随时关闭。",
              "",
              "以上仅为信息整理,不构成投资建议。",
            ].join("\n")
          );
        }
      }
    }
  }
}

const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
function readBody(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); });
}

http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/health") return json(res, 200, { ok: true, users: Object.keys(creds).length });
  // 鉴权
  if (SECRET && req.headers["x-clawbot-secret"] !== SECRET) return json(res, 401, { ok: false, error: "unauthorized" });

  if (req.method === "POST" && url === "/bind/start") {
    const { accountId } = await readBody(req);
    if (!accountId) return json(res, 400, { ok: false, error: "missing_accountId" });
    const q = await fetch(`${ILINK}/ilink/bot/get_bot_qrcode?bot_type=3`).then((r) => r.json()).catch(() => ({}));
    if (q.ret !== 0) return json(res, 502, { ok: false, error: "qrcode_failed" });
    pending.set(q.qrcode, { accountId: String(accountId), state: "pending", createdAt: nowSec() });
    return json(res, 200, { ok: true, qrcode: q.qrcode, qrImg: q.qrcode_img_content });
  }
  if (req.method === "POST" && url === "/bind/poll") {
    const { qrcode } = await readBody(req);
    const p = pending.get(qrcode);
    if (!p) return json(res, 200, { ok: true, state: "expired" });
    return json(res, 200, { ok: true, state: p.state, openId: p.openId || null });
  }
  if (req.method === "POST" && url === "/send") {
    const { openId, text } = await readBody(req);
    const c = creds[openId];
    if (!c) return json(res, 404, { ok: false, error: "not_bound" });
    const r = await ilinkSend(c.botToken, openId, c.contextToken, text);
    return json(res, r.ok ? 200 : 502, r);
  }
  if (req.method === "POST" && url === "/unbind") {
    const { openId } = await readBody(req);
    removeUser(openId);
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && url === "/users") {
    const list = Object.entries(creds).map(([openId, c]) => ({
      openId, accountId: c.accountId, boundAt: c.boundAt, lastMsgAt: c.lastMsgAt || null,
      active: !!c.contextToken, windowSec: c.lastMsgAt ? nowSec() - c.lastMsgAt : null,
    }));
    return json(res, 200, { ok: true, users: list });
  }
  return json(res, 404, { ok: false, error: "not_found" });
}).listen(PORT, () => console.log(`[bridge] 多租户桥监听 :${PORT}  已绑用户=${Object.keys(creds).length}`));

// 启动时恢复所有用户的 worker + 起绑定轮询
for (const openId of Object.keys(creds)) startWorker(openId);
bindWatcher();
