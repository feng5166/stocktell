// NYSE 法定休市日(规则计算,不用维护年表;review F3)。
// 用途:usMarketClosed 的交叉验证——「最近美东工作日无新行情」若发生在【非法定假日】,
// 大概率是行情源故障误判休市,而不是真休市;此时不发布节后观察桥(避免全天误显假休市内容),
// 已有的休市 FYI 告警会带上交叉验证结果供人眼判断。
// 边界(诚实):不含飓风/国葬等临时休市与半日市——那类日子桥不发布(fail-safe 方向),
// 只影响体验不影响正确性。
//
// NYSE 全年固定十个假日:元旦、MLK(1月第3个周一)、总统日(2月第3个周一)、耶稣受难日
// (复活节前的周五)、阵亡将士纪念日(5月最后一个周一)、六月节(6/19)、独立日(7/4)、
// 劳动节(9月第1个周一)、感恩节(11月第4个周四)、圣诞(12/25)。
// 固定日期逢周六前移周五、逢周日后移周一(observed)。

// 复活节(西方教会,Anonymous Gregorian algorithm)→ [month, day]
function easter(y: number): [number, number] {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// 该月第 n 个星期 w(w: 0=周日…6=周六)
function nthWeekday(y: number, month: number, w: number, n: number): string {
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  const day = 1 + ((7 + w - first) % 7) + (n - 1) * 7;
  return iso(y, month, day);
}
// 该月最后一个星期 w
function lastWeekday(y: number, month: number, w: number): string {
  const lastDay = new Date(Date.UTC(y, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(y, month - 1, lastDay)).getUTCDay();
  return iso(y, month, lastDay - ((7 + lastDow - w) % 7));
}
// 固定日期假日的 observed 日(周六→周五,周日→周一)。
// 二轮 review 小项⑤:用 UTC 毫秒运算跨月/跨年安全——元旦逢周六此前会拼出 "01-00" 无效日期。
// 注:NYSE 规则里元旦逢周六【不】前移到上一年 12/31(如 2022-01-01),该情形返回 null 由上层过滤。
function observed(y: number, month: number, day: number): string | null {
  const t = Date.UTC(y, month - 1, day);
  const dow = new Date(t).getUTCDay();
  if (dow === 6) {
    if (month === 1 && day === 1) return null; // 元旦逢周六:当年无 observed 假日
    const d = new Date(t - 86400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (dow === 0) {
    const d = new Date(t + 86400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return iso(y, month, day);
}

export function nyseHolidays(y: number): string[] {
  const [em, ed] = easter(y);
  const easterUTC = Date.UTC(y, em - 1, ed);
  const goodFriday = new Date(easterUTC - 2 * 86400_000);
  return ([
    observed(y, 1, 1), // New Year's Day(逢周六=当年无,见 observed)
    nthWeekday(y, 1, 1, 3), // MLK Day
    nthWeekday(y, 2, 1, 3), // Presidents' Day
    iso(y, goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate()), // Good Friday
    lastWeekday(y, 5, 1), // Memorial Day
    observed(y, 6, 19), // Juneteenth
    observed(y, 7, 4), // Independence Day
    nthWeekday(y, 9, 1, 1), // Labor Day = 9月第1个周一
    nthWeekday(y, 11, 4, 4), // Thanksgiving = 11月第4个周四
    observed(y, 12, 25), // Christmas
  ] as Array<string | null>).filter((d): d is string => d !== null);
}

export function isUSMarketHoliday(dateISO: string): boolean {
  const y = Number(dateISO.slice(0, 4));
  if (!Number.isFinite(y)) return false;
  return nyseHolidays(y).includes(dateISO);
}
