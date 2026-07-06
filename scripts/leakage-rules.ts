// 旧源直读扫描·单一规则源(scripts/source-leakage.ts CLI 与 scripts/pipeline-replay.ts 共用,
// 防两处 regex 各自演化 drift)。OLD=旧 relation.ts 主路径直读特征;SKIP=旧源定义本身+新体系+扫描器自身。
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

export const OLD_SOURCE_RE =
  /relationForCodeInChain|relationLabelFor|insightBundleForCode|segmentForCodeInChain|from ["']@\/lib\/relation["']/;
export const SKIP_RE =
  /relation-resolver|relation-rank|relation-lint|watch-relation|chain-relations|resolver-diagnostics|source-leakage|pipeline-replay|leakage-rules|[/\\]relation\.ts$/;

export type LeakageHit = { file: string; line: number; text: string };

// 扫 root(默认 src)下 .ts/.tsx 的旧源直读(跳过注释行)。
export function scanSourceLeakage(root = "src"): LeakageHit[] {
  const hits: LeakageHit[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p) && !SKIP_RE.test(p)) {
        readFileSync(p, "utf8")
          .split("\n")
          .forEach((line, i) => {
            const t = line.trim();
            if (OLD_SOURCE_RE.test(line) && !t.startsWith("//") && !t.startsWith("*"))
              hits.push({ file: p, line: i + 1, text: t.slice(0, 90) });
          });
      }
    }
  };
  walk(root);
  return hits;
}
