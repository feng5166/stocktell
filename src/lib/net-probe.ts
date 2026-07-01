// 网络探针:从当前 Vercel 区直连各数据源,报真实 http/耗时/错误。给多区对比用。
async function probe(
  name: string,
  url: string,
  init: RequestInit,
  timeoutMs = 20000
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const resp = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await resp.text();
    return {
      name,
      ok: resp.ok,
      httpStatus: resp.status,
      ms: Date.now() - start,
      snippet: text.slice(0, 100),
    };
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause;
    const code = cause as { code?: string; message?: string } | undefined;
    return {
      name,
      ok: false,
      ms: Date.now() - start,
      error: String(e),
      cause: cause ? String(code?.code ?? code?.message ?? cause) : undefined,
      timedOut: Date.now() - start >= timeoutMs - 500,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function runNetProbe() {
  // DB(Neon)往返:每个接口都要读库,这个延迟决定区域该怎么选。
  let dbMs: number | null = null;
  let dbErr: string | null = null;
  try {
    const { getPrisma } = await import("@/lib/prisma");
    const db = getPrisma();
    if (db) {
      const t0 = Date.now();
      await db.$queryRaw`SELECT 1`;
      dbMs = Date.now() - t0;
    } else {
      dbErr = "no db";
    }
  } catch (e) {
    dbErr = String(e);
  }

  const key = process.env.BOCHA_API_KEY;
  const sd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" })
    .format(new Date(Date.now() - 20 * 86400000))
    .replace(/-/g, "");
  const results = await Promise.all([
    probe("sina", "https://hq.sinajs.cn/list=sh601138", {
      headers: { Referer: "https://finance.sina.com.cn" },
    }),
    probe("tencent", "https://qt.gtimg.cn/q=sh601138", {}),
    probe("bocha", "https://api.bochaai.com/v1/web-search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key ?? "probe"}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "test", count: 1 }),
    }),
    probe("tushare-daily_basic", "https://api.tushare.pro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_name: "daily_basic",
        token: process.env.TUSHARE_TOKEN ?? "",
        params: { ts_code: "601138.SH", start_date: sd },
        fields: "ts_code,trade_date,pe_ttm,pb,total_mv",
      }),
    }),
  ]);
  return { region: process.env.VERCEL_REGION ?? "local", dbMs, dbErr, results };
}
