// 归档日期集(三轮 review T9):/daily 索引、sitemap、归档页前后日导航的单一日期源。
// = 已发布简报日 ∪ 有状态记录日(market_closed/blocked 等 0 简报日也有归档页——
// 那正是归档"解释那天为什么没有"的卖点,不能因为只查 published 条目而成孤儿)。
import { listBriefingDates } from "@/lib/briefings";
import { listBriefStatusDates } from "@/lib/brief-status";

export async function listArchiveDates(limit = 120): Promise<string[]> {
  const [brief, status] = await Promise.all([
    listBriefingDates(limit).catch(() => [] as string[]),
    listBriefStatusDates(limit * 2).catch(() => [] as string[]),
  ]);
  return Array.from(new Set([...brief, ...status]))
    .sort()
    .reverse()
    .slice(0, limit);
}
