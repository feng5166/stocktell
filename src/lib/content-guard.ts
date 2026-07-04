// 内容合规护栏(共享,单一来源)。放这里避免循环依赖:
// insight-pipeline/guard.ts 与 generate/morning-brief/chain-take 都从这里 import,
// 不再互引。三铁律③(不做交易指令)在【每天自动发布的日常内容路径】做代码级强制,
// 不再只靠 prompt——模型某天回「可低吸/关注企稳」也会被拦。

// 盘面操作 / 交易指令禁词(与首页 PRD §9.2 + 生成 prompt 禁语一致)。
// 违反即判非合规 → 调用方回退到模板/规则(构造式合规内容)。
const BANNED =
  /买入|卖出|建议买|建议卖|推荐买|抄底|满仓|加仓|减仓|清仓|低吸|接飞刀|站岗|目标价|建议参与|短线机会|回调关注|等回调|上车|别急着接|往里冲|追高|追涨|追板|低开|高开|企稳|放量|缩量|破位|补跌|超跌反弹|止跌|杀跌|洗盘|获利盘|兑现盘|错杀|出货|值得多看一眼|开盘盯|盘中盯|逢低|逢高|埋伏|潜伏|梭哈|梭一把|上车|下车|割肉|套牢|接盘|止损|止盈|建仓|补仓|重仓|半仓|空仓|打板/g;

// 产业语义白名单:先剥离这些合法指标用法,再扫禁词(如「出货量」「放量节奏」是产业指标,非盘面)
const INDUSTRIAL_WHITELIST =
  /出货量|放量节奏|订单放量|业务放量|产品放量|真正放量|批量出货|出货节奏|出货预期|出货占比|产能放量|开始出货|加速出货|规模出货/g;

export function scanBannedWords(text: string): string[] {
  const cleaned = text.replace(INDUSTRIAL_WHITELIST, "");
  const hits = cleaned.match(BANNED) ?? [];
  return Array.from(new Set(hits));
}

// 具体涨跌数字红线:半角 + 全角 + 中文数字(「涨了三个点」「涨了５%」「跌6个点」都算)。
export function hasSpecificMove(t: string): boolean {
  return (
    /\d+(\.\d+)?\s*[%％]/.test(t) || // 半角/全角 %:5% / 5％
    /\d+\s*个\s*多?\s*点/.test(t) || // 5个多点
    /(涨|跌)\s*了?\s*\d/.test(t) || // 涨了3
    /[０-９]+(?:[.．][０-９]+)?\s*[%％点]/.test(t) || // 全角数字 + %/点
    /(涨|跌)\s*了?\s*[０-９]/.test(t) || // 涨了５
    /(涨|跌)\s*了?\s*[一二三四五六七八九十两]+\s*(?:个\s*多?\s*点|成|[%％])/.test(t) || // 涨了三个点/跌两成
    /百分之\s*[0-9０-９一二三四五六七八九十两]+/.test(t) || // 百分之五
    /[0-9０-９一二三四五六七八九十两]+\s*个\s*百分点/.test(t) || // 三个百分点
    /(回撤|回调|反弹|涨|跌)\s*了?\s*[一二三四五六七八九十两]+\s*成/.test(t) // 回撤两成
  );
}

// 一次性合规判定(生成后 / 发布前用):既无禁词、也无具体涨跌数字才算干净。
export function isComplianceClean(text: string): {
  ok: boolean;
  bannedHits: string[];
  hasNumber: boolean;
} {
  const bannedHits = scanBannedWords(text);
  const hasNumber = hasSpecificMove(text);
  return { ok: bannedHits.length === 0 && !hasNumber, bannedHits, hasNumber };
}
