import { notFound } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import AdminPushClient from "./AdminPushClient";

export const dynamic = "force-dynamic";

export default async function AdminPushPage() {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) notFound(); // 非管理员账号 → 404
  return <AdminPushClient adminEmail={adminEmail} />;
}
