// P1 resolver 观察期健康检查 CLI(负责人 2026-07-04 定 2 交易日观察期)。只读、不改生产代码。
// 与 /admin/resolver-health 面板同源(src/lib/resolver-diagnostics.ts)。运行:npx tsx scripts/resolver-health.ts
// 运行时项(resolver fallback / cache miss / 生产日志)需生产监控,不在此脚本。
import { runDiagnostics } from "../src/lib/resolver-diagnostics";

const d = runDiagnostics();
console.log("=== P1 resolver 健康检查 ===");
for (const c of d.checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}${!c.ok && c.detail ? " — " + c.detail : ""}`);
console.log(`\n关系总数 ${d.total} · 链 ${d.chains} · ${Object.entries(d.byType).map(([t, n]) => `${t} ${n}`).join(" · ")}`);
if (d.lint.length) {
  console.log(`\n准入 lint: ${d.lint.length} 处违规`);
  d.lint.forEach((v) => console.log(`  ${v.name}[${v.code}] ${v.rule}${v.detail ? " · " + v.detail : ""}`));
}
const ok = d.passed && d.lint.length === 0;
console.log(ok ? "\n✅ 全部通过 — resolver 底座静态健康" : "\n✗ 有异常 — 需处理");
process.exit(ok ? 0 : 1);
