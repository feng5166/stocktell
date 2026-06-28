import { notFound } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

// 统一鉴权:所有 /admin/* 路由都经过这里,非管理员账号一律 404。
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) notFound();
  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <AdminNav adminEmail={adminEmail} />
      <main>{children}</main>
    </div>
  );
}
