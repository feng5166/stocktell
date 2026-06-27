// A股惯例:红涨绿跌
export function changeClass(v: number): string {
  if (v > 0) return "text-rose-600";
  if (v < 0) return "text-emerald-600";
  return "text-gray-400";
}

export function fmtChange(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}
