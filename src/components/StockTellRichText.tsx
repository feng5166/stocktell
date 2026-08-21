import React from "react";
import Link from "next/link";
import { STOCKS } from "@/data/stocks";

type StockTarget = { code: string; name: string };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 股票名全量识别；A 股代码也可直接识别。美股 ticker 中存在 AI/NOW 等普通词，
// 直接匹配会把正文误链，所以美股只按中文公司名识别。
const STOCK_TOKEN_MAP = new Map<string, StockTarget>();
for (const stock of STOCKS) {
  if (!STOCK_TOKEN_MAP.has(stock.name)) {
    STOCK_TOKEN_MAP.set(stock.name, { code: stock.code, name: stock.name });
  }
  if (stock.market === "A股" && /^\d{6}$/.test(stock.code)) {
    const target = { code: stock.code, name: stock.name };
    STOCK_TOKEN_MAP.set(stock.code, target);
    // 名称和代码连写时作为一个链接，避免“光迅科技(002281)”渲染成两个相邻链接。
    STOCK_TOKEN_MAP.set(`${stock.name}(${stock.code})`, target);
    STOCK_TOKEN_MAP.set(`${stock.name}（${stock.code}）`, target);
    STOCK_TOKEN_MAP.set(`${stock.name} ${stock.code}`, target);
  }
}

const STOCK_TOKEN_RE = new RegExp(
  `(${Array.from(STOCK_TOKEN_MAP.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})`,
  "g"
);

export function StockTextLinks({ text }: { text: string }) {
  return (
    <>
      {text.split(STOCK_TOKEN_RE).map((part, index) => {
        const target = STOCK_TOKEN_MAP.get(part);
        return target ? (
          <Link
            key={`${part}-${index}`}
            href={`/stock/${target.code}`}
            title={`查看${target.name}个股页`}
            className="font-medium text-brand-600 underline decoration-brand-200 underline-offset-2 hover:text-brand-700"
          >
            {part}
          </Link>
        ) : (
          part
        );
      })}
    </>
  );
}

// 行内加粗与股票链接组合渲染。股票名在 **粗体** 内也能正确成为链接。
export function InlineStockText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((segment, index) =>
        /^\*\*[^*]+\*\*$/.test(segment) ? (
          <strong key={index} className="font-semibold text-gray-900">
            <StockTextLinks text={segment.slice(2, -2)} />
          </strong>
        ) : (
          <StockTextLinks key={index} text={segment} />
        )
      )}
    </>
  );
}

// StockTell 流式解读统一渲染器：轻量 Markdown + 全量股票链接。
export function StockTellRichText({ text }: { text: string }) {
  const blocks: JSX.Element[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) return;
    const heading = /^#{1,6}\s/.test(line) || /^\*\*[^*]+\*\*[::]?$/.test(line);
    let content = line.replace(/^#{1,6}\s*/, "");
    const isList = /^[-*]\s+/.test(content);
    if (isList) content = content.replace(/^[-*]\s+/, "");

    if (heading) {
      const headingText = content.replace(/^\*\*/, "").replace(/\*\*[::]?$/, "");
      blocks.push(
        <p key={index} className="mt-3 text-sm font-semibold text-gray-900 first:mt-0">
          {headingText}
        </p>
      );
    } else if (isList) {
      blocks.push(
        <p key={index} className="ml-1 mt-1 text-sm leading-relaxed text-gray-700">
          • <InlineStockText text={content} />
        </p>
      );
    } else {
      blocks.push(
        <p key={index} className="mt-1.5 text-sm leading-relaxed text-gray-700">
          <InlineStockText text={content} />
        </p>
      );
    }
  });
  return <>{blocks}</>;
}
