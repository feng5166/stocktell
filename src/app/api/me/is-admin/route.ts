import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

// 客户端判断当前用户是否管理员(首页改 ISR 后,管理员入口只能客户端按需取)。
export async function GET() {
  return NextResponse.json({ isAdmin: await isAdminSession().catch(() => false) });
}
