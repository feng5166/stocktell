import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getLLMFor } from "@/lib/llm-provider";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
// 钉到香港:Vercel 美区连不上阿里云北京(博查 SLB),香港离得近、连通好。
export const preferredRegion = "hkg1";

// 「为什么动」诊断:一击定位来源为何为空。直接打博查(绕开 whyCache),报 HTTP 状态 + 命中数;
// 再报 LLM 解析状态。不泄漏任何密钥值,只报是否存在/长度。
// 用法:管理员登录后浏览器开 /api/admin/why-diag;或 curl -H "Authorization: Bearer $ADMIN_TOKEN"。
//   ?clear=1 额外清空 why 缓存(旧的 null/无来源结果会挡住新 key 生效,清后下次访问重新检索)。
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const key = process.env.BOCHA_API_KEY;
  const out: Record<string, unknown> = {
    region: process.env.VERCEL_REGION ?? "local", // 期望 hkg1
    env: {
      bochaKeyPresent: !!key,
      bochaKeyLen: key ? key.trim().length : 0, // 只报长度,便于发现空串/误贴带空格
      whyEnabled: !!process.env.WHY_ENABLED,
      whyLlmModel: process.env.WHY_LLM_MODEL ?? null,
      llmApiKeyPresent: !!process.env.LLM_API_KEY,
    },
  };

  // 1) 直接打博查 web-search,拿真实 HTTP 状态(bocha.ts 平时把错误吞成 null,这里要看清)
  if (key) {
    try {
      const resp = await fetch("https://api.bochaai.com/v1/web-search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "英伟达 NVDA 美股 异动 原因 财报",
          freshness: "oneWeek",
          summary: true,
          count: 3,
        }),
        cache: "no-store",
      });
      const text = await resp.text();
      let hitCount = 0;
      let firstTitle: string | null = null;
      try {
        const j = JSON.parse(text);
        const list =
          j?.data?.webPages?.value ?? j?.webPages?.value ?? j?.data?.value ?? [];
        if (Array.isArray(list)) {
          hitCount = list.length;
          firstTitle = list[0]?.name ?? null;
        }
      } catch {
        /* 非 JSON,保留原始片段辅助排错 */
      }
      out.bochaTest = {
        httpStatus: resp.status,
        ok: resp.ok,
        hitCount,
        firstTitle,
        // 非 2xx 时给出响应片段(常见:401 key 无效/错产品、402 余额不足、429 限流)
        bodySnippet: resp.ok ? undefined : text.slice(0, 300),
      };
    } catch (e) {
      // undici 把真正原因塞在 e.cause(ETIMEDOUT/ECONNRESET/ENOTFOUND/证书错误…),挖出来
      const cause = (e as { cause?: unknown })?.cause;
      const code = (cause as { code?: string; message?: string } | undefined);
      out.bochaTest = {
        error: String(e),
        cause: cause ? String(code?.code ?? code?.message ?? cause) : undefined,
        region: process.env.VERCEL_REGION ?? null, // 实际执行区域,确认是否 hkg1
      };
    }
  } else {
    out.bochaTest = { skipped: "BOCHA_API_KEY 未配置(生产环境 Vercel 需单独配置 + 重新部署才生效)" };
  }

  // 2) LLM 解析状态(为什么动 总结需要 getLLMFor("pro"))
  try {
    const llm = await getLLMFor("pro");
    out.llm = llm
      ? { resolved: true, provider: llm.provider, model: llm.model }
      : { resolved: false, hint: "LLM_API_KEY 未配置或兜底未就绪" };
  } catch (e) {
    out.llm = { resolved: false, error: String(e) };
  }

  // 3) 可选:清 why 缓存(旧 null/无来源结果会挡住新 key 生效)
  if (req.nextUrl.searchParams.get("clear") === "1") {
    const db = getPrisma();
    if (db) {
      try {
        const r = await db.whyCache.deleteMany({});
        out.cacheCleared = { deleted: r.count };
      } catch (e) {
        out.cacheCleared = { error: String(e) };
      }
    } else {
      out.cacheCleared = { error: "no db" };
    }
  }

  return NextResponse.json({ ok: true, ...out });
}
