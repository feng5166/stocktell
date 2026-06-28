import AdminUsersClient from "./AdminUsersClient";

export const dynamic = "force-dynamic";

// 鉴权由 src/app/admin/layout.tsx 统一处理
export default function AdminUsersPage() {
  return <AdminUsersClient />;
}
