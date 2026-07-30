import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

// 管理员邮箱白名单:单一来源在 lib/admin-emails(middleware 也用),这里 re-export 保持既有引用。
export { ADMIN_EMAILS } from "@/lib/admin-emails";
import { ADMIN_EMAILS } from "@/lib/admin-emails";

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
