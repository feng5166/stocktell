// 隔夜美股大盘指数简称 → 全称,给"费半"这类简称做 tooltip / 脚注(新用户常不懂)。
// 指数名的权威定义在 lib/quotes.ts 的 US_INDICES;这里只放展示用的全称注释。
export const INDEX_FULL: Record<string, string> = {
  纳指: "纳斯达克综合指数",
  标普: "标普 500 指数",
  费半: "费城半导体指数(SOX)",
};

// 最需要解释的一条(A股 AI/芯片链隔夜风向标)——页面脚注 / 海报共用
export const FEIBAN_NOTE = "费半 = 费城半导体指数,A股芯片/AI链隔夜风向标";
