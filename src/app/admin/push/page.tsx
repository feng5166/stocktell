import { requireAdmin } from "@/lib/admin";
import AdminPushClient from "./AdminPushClient";

export const dynamic = "force-dynamic";

export default async function AdminPushPage() {
  await requireAdmin(); // 非管理员 → 404
  return <AdminPushClient />;
}
