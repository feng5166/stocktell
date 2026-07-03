import { requireAdmin } from "@/lib/admin";
import AdminInsightsClient from "./AdminInsightsClient";

export const dynamic = "force-dynamic";

export default async function AdminInsightsPage() {
  await requireAdmin(); // 非管理员 → 404
  return <AdminInsightsClient />;
}
