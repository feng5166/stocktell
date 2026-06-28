import { notFound } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import AdminUsersClient from "./AdminUsersClient";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) notFound(); // 非管理员账号 → 404
  return <AdminUsersClient adminEmail={adminEmail} />;
}
