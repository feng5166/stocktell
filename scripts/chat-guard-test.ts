// 情境追问护栏测试(review:2400 行新功能零自动化测试的第一块补丁;静态零网络,进 smoke)。
// 覆盖:①意图闸——交易类问法(含 review 点名的持有/调仓/上涨空间绕过族)100% 重定向、
// 正常产业链追问 0 误伤;②Pro 意向白名单——原型链键/重复项/超选被正确拒斥。
// 词表(insight-chat.ts TRADING_INTENT)或枚举(pro-intent.ts)变更必须同步本用例。
import { classifyIntent } from "../src/lib/insight-chat";
import { parseProIntent } from "../src/lib/pro-intent";

let fail = 0;
const expect = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    console.log(`  ❌ ${name}${detail ? `(${detail})` : ""}`);
    fail++;
  }
};

/* ---------- ① 意图闸 ---------- */
const MUST_REDIRECT = [
  // 基础买卖/预测/仓位
  "那我现在该买吗", "中际旭创能涨到多少", "明天走势怎么看", "给个目标价",
  "现在抄底合适吗", "要不要止损", "我该加仓还是减仓", "几成仓合适",
  "能不能上车", "会跌吗", "低吸还是追高", "梭哈行不行", "做T可以吗",
  "这波能赚钱吗", "什么价位可以入手", "涨停能封住吗",
  // review 点名的绕过族:持有/调仓/上涨空间/操作/买卖点
  "该继续持有吗", "我持仓里有它,要不要调仓", "上涨空间还有多大", "还有多少空间",
  "现在什么点位适合", "帮我看看怎么操作", "值得买入吗", "能不能补仓",
  "该止盈了吗", "拿住还是出掉", "做个波段行不行", "等回调再进可以吗",
  "抢反弹有机会吗", "换仓到别的票怎么样", "割肉还是扛着", "什么时候是好时机",
];
const MUST_PASS = [
  "这一步最关键的依据是什么?",
  "哪个前提不成立时这条链会断?",
  "这是直接关系还是情绪映射?",
  "有什么相反证据?",
  "光模块和铜连接的替代关系怎么理解?",
  "验证点里的订单披露去哪里看?",
  "我的自选里哪些和这一步有关?",
  "为什么英维克是间接映射?",
  "这个环节的国产替代逻辑是什么?",
  "鸿蒙操作系统相关的公司为什么不在这条链里?", // 「操作」误伤回归:操作系统必须放行
  "液冷渗透率的数据来源是什么?",
];
console.log("[意图闸]");
for (const q of MUST_REDIRECT)
  expect(`拦:「${q}」`, classifyIntent(q) === "trading");
for (const q of MUST_PASS)
  expect(`放:「${q}」`, classifyIntent(q) === "pass");

/* ---------- ② Pro 意向白名单 ---------- */
console.log("[Pro 意向白名单]");
expect(
  "原型链键被拒(toString/constructor 不算合法选择)",
  parseProIntent({ choices: ["toString", "constructor"], useCase: "preopen" }) === null
);
expect(
  "原型链 useCase 被拒",
  parseProIntent({ choices: ["more_chains"], useCase: "hasOwnProperty" }) === null
);
const dup = parseProIntent({ choices: ["other", "other", "more_chains"], useCase: "preopen" });
expect("重复项去重后最多 2 项", dup !== null && dup.choices.length === 2 && new Set(dup.choices).size === 2);
const over = parseProIntent({
  choices: ["watchlist_tracking", "chain_daily_alert", "more_chains"],
  useCase: "research",
});
expect("超选截断到 2 项", over !== null && over.choices.length === 2);
expect("0 选择被拒", parseProIntent({ choices: [], useCase: "preopen" }) === null);
const otherOk = parseProIntent({ choices: ["other"], useCase: "intraday", other: "x".repeat(300) });
expect("other 文本截断 ≤100", otherOk !== null && (otherOk.other ?? "").length <= 100);

console.log(fail === 0 ? "\n✅ 护栏测试全过" : `\n❌ ${fail} 处失败`);
process.exit(fail === 0 ? 0 : 1);
