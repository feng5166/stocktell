import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

// 管理员邮箱白名单(可用 ADMIN_EMAILS 环境变量覆盖,逗号分隔)
export const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS ?? "feng5166@gmail.com,feng.5166@163.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// 当前登录用户若是管理员,返回其邮箱,否则 null
export async function getAdminEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const db = getPrisma();
  if (!db) return null;
  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  const email = u?.email?.toLowerCase() ?? null;
  return email && ADMIN_EMAILS.includes(email) ? email : null;
}

export async function isAdminSession(): Promise<boolean> {
  return (await getAdminEmail()) !== null;
}

// 页面级守卫:非管理员直接 notFound()(返回真 404)。各 /admin server page 调用。
export async function requireAdmin(): Promise<string> {
  const email = await getAdminEmail();
  if (!email) notFound();
  return email;
}
