import { requireAdmin } from "@/lib/admin";
import AdminEmailClient from "./AdminEmailClient";

export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  await requireAdmin(); // 非管理员 → 404
  return <AdminEmailClient />;
}
