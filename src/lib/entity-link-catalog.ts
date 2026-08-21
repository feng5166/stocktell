import { STOCKS } from "@/data/stocks";
import { CHAINS } from "@/data/chains";

export type EntityLinkDefinition = {
  text: string;
  href: string;
  kind: "stock" | "chain";
  label: string;
};

const catalog = new Map<string, EntityLinkDefinition>();

function add(definition: EntityLinkDefinition) {
  // 同名冲突时股票优先；具体股票名比产业链泛称更不容易误判。
  const current = catalog.get(definition.text);
  if (!current || (current.kind === "chain" && definition.kind === "stock")) {
    catalog.set(definition.text, definition);
  }
}

for (const stock of STOCKS) {
  const base = {
    href: `/stock/${stock.code}`,
    kind: "stock" as const,
    label: stock.name,
  };
  add({ ...base, text: stock.name });
  if (stock.market === "A股" && /^\d{6}$/.test(stock.code)) {
    add({ ...base, text: stock.code });
  }
}

for (const chain of Object.values(CHAINS)) {
  const base = {
    href: `/chain/${chain.id}`,
    kind: "chain" as const,
    label: chain.name,
  };
  const aliases = new Set([
    chain.name,
    chain.name.replace(/\s+/g, ""),
    chain.short,
    chain.short.replace(/\s+/g, ""),
  ]);
  for (const text of Array.from(aliases)) add({ ...base, text });
}

// 站内长期使用、但不是 ChainConfig 正式名称的口语别名。
// 只登记有明确详情页的名称，不把“机器人链”等尚无详情页的泛词伪装成链接。
const CHAIN_ALIASES: Record<string, { href: string; label: string }> = {
  "AI 推理基础设施链": { href: "/chain/ai", label: "AI 产业链" },
  AI推理基础设施链: { href: "/chain/ai", label: "AI 产业链" },
  "AI 主链": { href: "/chain/ai", label: "AI 产业链" },
  AI主链: { href: "/chain/ai", label: "AI 产业链" },
  数据中心电力链: { href: "/chain/data-center-power", label: "AI 数据中心电力基础设施链" },
  "AI 数据中心电力链": { href: "/chain/data-center-power", label: "AI 数据中心电力基础设施链" },
  AI数据中心电力链: { href: "/chain/data-center-power", label: "AI 数据中心电力基础设施链" },
  电力设备链: { href: "/chain/data-center-power", label: "AI 数据中心电力基础设施链" },
  半导体设备产业链: { href: "/chain/semiconductor-equipment", label: "半导体设备与先进制程链" },
  先进制程链: { href: "/chain/semiconductor-equipment", label: "半导体设备与先进制程链" },
  华为生态链: { href: "/chain/huawei-ecosystem", label: "华为产业生态链" },
  "AI 应用链": { href: "/insight/ai-application", label: "AI 应用产业链" },
  AI应用链: { href: "/insight/ai-application", label: "AI 应用产业链" },
  "AI 应用产业链": { href: "/insight/ai-application", label: "AI 应用产业链" },
  AI应用产业链: { href: "/insight/ai-application", label: "AI 应用产业链" },
};

for (const [text, target] of Object.entries(CHAIN_ALIASES)) {
  add({ text, href: target.href, kind: "chain", label: target.label });
}

// 长词优先，确保“AI 数据中心电力基础设施链”不会先命中短词“AI 链”。
export const ENTITY_LINK_CATALOG = Array.from(catalog.values()).sort(
  (a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text)
);
