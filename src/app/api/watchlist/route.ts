import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  listWatchlist,
  addWatch,
  removeWatch,
  mergeWatchlist,
} from "@/lib/watchlist";

export const dynamic = "force-dynamic";

async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

// 游客无服务端自选(走客户端 localStorage),统一返回空,不报错
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: true, codes: [] });
  return NextResponse.json({ ok: true, codes: await listWatchlist(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  // 登录迁移:{ merge: string[] } 把本地自选并入库
  if (Array.isArray(body.merge)) {
    return NextResponse.json({
      ok: true,
      codes: await mergeWatchlist(userId, body.merge),
    });
  }
  // 加单只:{ code }
  if (typeof body.code === "string") {
    await addWatch(userId, body.code);
    return NextResponse.json({ ok: true, codes: await listWatchlist(userId) });
  }
  return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  await removeWatch(userId, code);
  return NextResponse.json({ ok: true, codes: await listWatchlist(userId) });
}
