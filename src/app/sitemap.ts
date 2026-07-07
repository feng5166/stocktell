import type { MetadataRoute } from "next";
import { CHAINS } from "@/data/chains";
import { INSIGHT_CHAINS } from "@/data/insight-chains";
import { STOCKS } from "@/data/stocks";
import { listArchiveDates } from "@/lib/archive-dates";
import { listPublishedDailyDates } from "@/lib/insight-pipeline/docs";

// SEO 基建(2.1-W4)。内容资产四层:静态页 → 链页/insight 三链 → 股票页 → 每日归档。
// DB 归档查询全部 fail-safe:库不可用时退化为纯静态条目,sitemap 本身绝不 500。
import { SITE_URL } from "@/lib/site";
const BASE = SITE_URL;

export const revalidate = 3600; // 归档每天最多多一天,1h 再生成足够

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/track`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/stocks`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/relations`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/daily`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.3 },
  ];
  // 产业链页 + 三条核心链 insight(PRODUCT-CORE:链页承担 分享落地+SEO+转化)
  for (const c of Object.values(CHAINS)) {
    out.push({ url: `${BASE}/chain/${c.id}`, changeFrequency: "daily", priority: 0.9 });
  }
  for (const slug of Object.keys(INSIGHT_CHAINS)) {
    out.push({ url: `${BASE}/insight/${slug}`, changeFrequency: "daily", priority: 0.9 });
  }
  // 股票页(~200 只,回答"XX 在哪条产业链/什么映射"的长尾问题)
  for (const s of STOCKS) {
    out.push({ url: `${BASE}/stock/${s.code}`, changeFrequency: "weekly", priority: 0.5 });
  }
  // 每日归档(DB;fail-safe 空数组)
  try {
    const briefDates = await listArchiveDates(120);
    for (const d of briefDates) {
      out.push({ url: `${BASE}/daily/${d}`, changeFrequency: "yearly", priority: 0.4 });
    }
    for (const chain of Object.values(CHAINS).filter((c) => c.insightSlug)) {
      const dates = await listPublishedDailyDates(chain.id, 120);
      for (const d of dates) {
        out.push({
          url: `${BASE}/insight/${chain.insightSlug}/${d}`,
          changeFrequency: "yearly",
          priority: 0.4,
        });
      }
    }
  } catch {
    /* 归档条目缺席不影响 sitemap 主体 */
  }
  return out;
}
