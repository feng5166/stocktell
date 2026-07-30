// 管理员邮箱白名单(单一来源,可用 ADMIN_EMAILS 环境变量覆盖,逗号分隔)。
// 独立成零依赖模块:middleware(Edge,不能碰 prisma/next-auth server 侧)与 lib/admin.ts
// (Node,查 DB)都要用——此前两处各自硬编码一份默认值,改动会静默漂移(2026-07-30 review)。
// 注意两个消费方语义本就不同:middleware 信 JWT email(边缘快速挡门),admin.ts 信 DB email
// (页面/API 终判);共享的只是"名单"本身。
export const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS ?? "feng5166@gmail.com,feng.5166@163.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
