import { requireAdmin } from "@/lib/admin";
import AdminBriefingClient from "./AdminBriefingClient";

export const dynamic = "force-dynamic";

export default async function AdminBriefingPage() {
  await requireAdmin(); // 非管理员 → 404
  return <AdminBriefingClient />;
}
