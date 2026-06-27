// StockTell 微信推送桥(直连 iLink):
//  ① 长轮询 getupdates 收用户消息 → 绑定码转发给 StockTell /api/push/bind-weixin
//  ② HTTP POST /send {openId,text} → 调 iLink sendmessage 发到用户微信(StockTell 的 CLAWBOT_API_URL 指这里)
// 运行:先 `npm run login` 拿 token.json,再 `npm start`。需常驻 + 公网可达(给 Vercel 调 /send)。
import http from "http";
import fs from "fs";
import crypto from "crypto";

const { bot_token, baseurl } = JSON.parse(fs.readFileSync("token.json", "utf8"));
const BASE = baseurl || "https://ilinkai.weixin.qq.com";
const SECRET = process.env.BRIDGE_SECRET || "";
const STOCKTELL = process.env.STOCKTELL_BASE || "https://stocktell.vercel.app";
const PORT = process.env.PORT || 8787;

// 每个用户最近的 context_token(发消息要带;持久化以便重启后仍能主动推送)
const CTX_FILE = "ctx.json";
let ctx = fs.existsSync(CTX_FILE) ? JSON.parse(fs.readFileSync(CTX_FILE, "utf8")) : {};
const saveCtx = () => fs.writeFileSync(CTX_FILE, JSON.stringify(ctx));

function ilinkHeaders() {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": Buffer.from(String(Math.floor(Math.random() * 0xffffffff))).toString("base64"),
    Authorization: `Bearer ${bot_token}`,
  };
}

async function sendText(toUserId, text, contextToken) {
  const body = {
    msg: {
      from_user_id: "",
      to_user_id: toUserId,
      // 每条消息必须带全局唯一 client_id(服务端幂等去重键);缺了会被静默丢弃(只放过第一条)
      client_id: `stocktell-weixin:${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      message_type: 2,
      message_state: 2,
      context_token: contextToken || "",
      item_list: [{ type: 1, text_item: { text } }],
    },
    base_info: { channel_version: "1.0.2" },
  };
  try {
    const r = await fetch(`${BASE}/ilink/bot/sendmessage`, {
      method: "POST",
      headers: ilinkHeaders(),
      body: JSON.stringify(body),
    });
    const raw = await r.text();
    let d = {};
    try { d = JSON.parse(raw); } catch {}
    // iLink sendmessage 成功时返回 HTTP 200 + 空 {}(无 ret 字段);有 ret 时 0 才算成功
    const ok = r.ok && (d.ret === undefined || d.ret === 0);
    if (!ok) console.error(`[bridge] 发送失败 to=${toUserId} http=${r.status} body=${raw}`);
    return { ok, ret: d.ret, http: r.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function callStockTell(path, payload) {
  try {
    const r = await fetch(`${STOCKTELL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-clawbot-secret": SECRET },
      body: JSON.stringify(payload),
    });
    return await r.json().catch(() => ({}));
  } catch {
    return {};
  }
}

// 长轮询收消息
async function pollLoop() {
  let buf = "";
  console.log("[bridge] getupdates 长轮询已启动");
  while (true) {
    try {
      const r = await fetch(`${BASE}/ilink/bot/getupdates`, {
        method: "POST",
        headers: ilinkHeaders(),
        body: JSON.stringify({ get_updates_buf: buf, base_info: { channel_version: "1.0.2" } }),
      });
      const d = await r.json();
      if (d.get_updates_buf) buf = d.get_updates_buf;
      for (const m of d.msgs || []) {
        const from = m.from_user_id;
        const ctoken = m.context_token;
        const text = (m.item_list || [])
          .map((i) => i.text_item?.text)
          .filter(Boolean)
          .join("")
          .trim();
        if (from && ctoken) {
          ctx[from] = ctoken;
          saveCtx();
        }
        if (!text) continue;
        console.log(`[bridge] 收到 ${from}: ${text}`);
        if (/^ST[A-Z0-9]{4}$/i.test(text)) {
          const j = await callStockTell("/api/push/bind-weixin", {
            token: text.toUpperCase(),
            openId: from,
          });
          console.log(`[bridge] bind 结果: ${JSON.stringify(j)}`);
          const reply = j.replyText || (j.ok ? "绑定成功 ✅" : "绑定失败,请在 stocktell.me 重新获取绑定码后再发一次。");
          const sr = await sendText(from, reply, ctoken);
          console.log(`[bridge] bind 回复发送: ${JSON.stringify(sr)}`);
        } else if (text === "解绑" || /^unbind$/i.test(text)) {
          const j = await callStockTell("/api/push/unbind-weixin", { openId: from });
          await sendText(from, j.replyText || "已取消推送。", ctoken);
        } else {
          await sendText(
            from,
            "把你在 stocktell.me 点「开启微信推送」拿到的绑定码发给我即可开启;发「解绑」可取消。",
            ctoken
          );
        }
      }
    } catch (e) {
      console.error("[bridge] poll error:", e.message);
      await new Promise((s) => setTimeout(s, 3000));
    }
  }
}

// /send:StockTell 调它给用户发消息
http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/send") {
      if (SECRET && req.headers["x-clawbot-secret"] !== SECRET) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end('{"ok":false,"error":"unauthorized"}');
      }
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", async () => {
        try {
          const { openId, text } = JSON.parse(b);
          const r = await sendText(openId, text, ctx[openId]);
          res.writeHead(r.ok ? 200 : 502, { "Content-Type": "application/json" });
          res.end(JSON.stringify(r));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        }
      });
    } else if (req.url === "/health") {
      res.writeHead(200);
      res.end("ok");
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(PORT, () => console.log(`[bridge] /send 监听 :${PORT}`));

pollLoop();
