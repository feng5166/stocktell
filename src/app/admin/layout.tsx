import { getAdminEmail } from "@/lib/admin";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

// 鉴权在各 page 用 requireAdmin() 做(返回真 404);这里只负责:管理员才渲染顶部导航。
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return <>{children}</>; // 非管理员:不渲染导航(page 的 requireAdmin 会 404)
  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <AdminNav adminEmail={adminEmail} />
      <main>{children}</main>
    </div>
  );
}
