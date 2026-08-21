"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { EntityLinkDefinition } from "@/lib/entity-link-catalog";

const EXCLUDED_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "script",
  "style",
  "code",
  "pre",
  "summary",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "[role='heading']",
  "[contenteditable='true']",
  "[data-no-entity-links]",
].join(",");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function GlobalEntityLinks({
  entities,
}: {
  entities: EntityLinkDefinition[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const byText = new Map(entities.map((entity) => [entity.text, entity]));
    const pattern = new RegExp(`(${entities.map((entity) => escapeRegExp(entity.text)).join("|")})`, "g");

    const excluded = (node: Text) =>
      node.parentElement?.closest(EXCLUDED_SELECTOR) != null;

    const linkTextNode = (node: Text) => {
      const source = node.data;
      if (!source.trim() || excluded(node)) return;
      pattern.lastIndex = 0;
      const rawMatches = Array.from(source.matchAll(pattern));
      if (rawMatches.length === 0) return;

      // “光迅科技(002281)”里的名称和代码合成一个链接，避免相邻重复链接。
      const matches: { start: number; end: number; text: string; entity: EntityLinkDefinition }[] = [];
      for (const match of rawMatches) {
        const start = match.index ?? 0;
        const entity = byText.get(match[0]);
        if (!entity) continue;
        const previous = matches.at(-1);
        const between = previous ? source.slice(previous.end, start) : "";
        if (previous && previous.entity.href === entity.href && /^[\s()（）]*$/.test(between)) {
          previous.end = start + match[0].length;
          previous.text = source.slice(previous.start, previous.end);
        } else {
          matches.push({ start, end: start + match[0].length, text: match[0], entity });
        }
      }
      if (matches.length === 0) return;

      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let linked = false;
      for (const match of matches) {
        if (match.start > cursor) fragment.append(document.createTextNode(source.slice(cursor, match.start)));

        // 当前详情页里的标题/代码不做无意义的自链接，但其它实体照常可点。
        if (match.entity.href === pathname) {
          fragment.append(document.createTextNode(match.text));
        } else {
          const anchor = document.createElement("a");
          anchor.href = match.entity.href;
          anchor.textContent = match.text;
          anchor.title = match.entity.kind === "stock" ? `查看${match.entity.label}个股页` : `查看${match.entity.label}产业链`;
          anchor.dataset.stocktellEntity = match.entity.kind;
          anchor.className =
            "font-medium text-brand-600 underline decoration-brand-200 underline-offset-2 hover:text-brand-700";
          fragment.append(anchor);
          linked = true;
        }
        cursor = match.end;
      }
      if (!linked) return;
      if (cursor < source.length) fragment.append(document.createTextNode(source.slice(cursor)));
      node.replaceWith(fragment);
    };

    const scan = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        linkTextNode(root as Text);
        return;
      }
      if (!(root instanceof Element) && root !== document.body) return;
      if (root instanceof Element && root.closest(EXCLUDED_SELECTOR)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      let current: Node | null;
      while ((current = walker.nextNode())) texts.push(current as Text);
      for (const text of texts) linkTextNode(text);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") scan(mutation.target);
        for (const node of Array.from(mutation.addedNodes)) scan(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const frame = requestAnimationFrame(() => scan(document.body));

    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[data-stocktell-entity]")
        : null;
      if (!target) return;
      event.preventDefault();
      router.push(target.getAttribute("href") || "/");
    };
    document.addEventListener("click", navigate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("click", navigate);
    };
  }, [entities, pathname, router]);

  return null;
}
