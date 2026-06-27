// 统一时区/日期工具(此前散在 8+ 处各写一份)
export function todayISO(): string {
  // Asia/Shanghai 当日 YYYY-MM-DD(en-CA 直接给该格式)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function beijingWeekday(): number {
  // 0=周日 .. 6=周六
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[s] ?? -1;
}
