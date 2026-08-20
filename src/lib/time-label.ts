// 全站时效性标签的统一格式。只做纯格式化,服务端/客户端都可复用。
// 动态判断用「M/D HH:mm」,日频行情/财报继续显示其交易日或报告期。
const BEIJING = "Asia/Shanghai";

export function formatBeijingMDHM(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${Number(part("month"))}/${Number(part("day"))} ${part("hour")}:${part("minute")}`;
}

export function formatBeijingHM(value: string | Date | null | undefined): string | null {
  const full = formatBeijingMDHM(value);
  return full?.split(" ")[1] ?? null;
}

export function formatYmdMD(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
}

