import { requireAdmin } from "@/lib/admin";
import AdminUsersClient from "./AdminUsersClient";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdmin(); // 非管理员 → 404
  return <AdminUsersClient />;
}
