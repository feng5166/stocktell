import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// /admin 默认进"用户"tab(鉴权由 layout 统一处理)
export default function AdminIndex() {
  redirect("/admin/users");
}
