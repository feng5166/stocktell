import { NextResponse } from "next/server";

// 部署版本探针:返回本次部署构建时的 commit SHA(Vercel 注入 VERCEL_GIT_COMMIT_SHA)。
// 用途:deploy-initdb 工作流轮询本端点,SHA == 推送的提交 → 新部署已真实接管流量,
// 再打 ensure-schema——消除「实例已启动、init-db 还没跑」的 schema 哨兵窗口(2026-07-12 实踩:
// 部署启动到人工 init-db 之间几分钟,哨兵如实报了缺表)。SHA 公开无敏感性(业界常规)。
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
