// LLM 提供方运行时开关:主(modelverse)/ 兜底(DeepSeek 官方)手动切换。
// 主延迟劣化时不自动切,只飞书提醒 + 后台/一键链接手动切(用户明确要手动控制)。
// 开关存 quotesCache(id=llm-provider,免迁移),进程内缓存 30s;兜底统一用 flash。
import OpenAI from "openai";
import { getPrisma } from "@/lib/prisma";
import { sendFeishu } from "@/lib/feishu";

export type LLMProvider = "primary" | "fallback";
const FLAG_ID = "llm-provider";
const CACHE_TTL = 30_000;
let cached: { provider: LLMProvider; at: number } | null = null;

export async function getActiveProvider(): Promise<LLMProvider> {
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.provider;
  let provider: LLMProvider = "primary";
  const db = getPrisma();
  if (db) {
    const row = await db.quotesCache.findUnique({ where: { id: FLAG_ID } }).catch(() => null);
    if ((row?.data as { provider?: string } | undefined)?.provider === "fallback")
      provider = "fallback";
  }
  cached = { provider, at: Date.now() };
  return provider;
}

export async function setActiveProvider(provider: LLMProvider): Promise<void> {
  const db = getPrisma();
  if (db) {
    await db.quotesCache
      .upsert({
        where: { id: FLAG_ID },
        create: { id: FLAG_ID, data: { provider } },
        update: { data: { provider } },
      })
      .catch(() => {});
  }
  cached = { provider, at: Date.now() }; // 立即生效(本实例);其它实例 ≤30s 收敛
}

const fallbackConfigured = () =>
  !!(process.env.LLM_FALLBACK_API_KEY && process.env.LLM_FALLBACK_BASE_URL);

export function fallbackAvailable(): boolean {
  return fallbackConfigured();
}

// 解析当前该用的 client + 模型(tier=pro/fast)。兜底也按档位走(与主一致):pro 档用
// LLM_FALLBACK_MODEL(deepseek-v4-pro,保简报/why 质量),fast 档用 LLM_FALLBACK_MODEL_FAST
// (flash,早报/深读 短文+交互,防 reasoning 截断)。未配兜底或未切换则用主(modelverse)。
// 无任何 key 返回 null(调用方回退模板)。
export async function getLLMFor(
  tier: "pro" | "fast"
): Promise<{ client: OpenAI; model: string; provider: LLMProvider } | null> {
  const provider = await getActiveProvider();
  if (provider === "fallback" && fallbackConfigured()) {
    return {
      client: new OpenAI({
        apiKey: process.env.LLM_FALLBACK_API_KEY!,
        baseURL: process.env.LLM_FALLBACK_BASE_URL!,
      }),
      model:
        tier === "pro"
          ? process.env.LLM_FALLBACK_MODEL || "deepseek-v4-pro"
          : process.env.LLM_FALLBACK_MODEL_FAST || "deepseek-v4-flash",
      provider: "fallback",
    };
  }
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    client: new OpenAI({
      apiKey,
      baseURL: process.env.LLM_BASE_URL || "https://api.modelverse.cn/v1",
    }),
    model:
      tier === "pro"
        ? process.env.LLM_MODEL || "deepseek-v4-pro"
        : process.env.LLM_MODEL_FAST || "deepseek-v4-flash",
    provider: "primary",
  };
}

// 主 LLM 劣化检测:连续失败(含 SDK 超时,已按各调用点 timeout 编码"太慢即失败")达阈值
// → 飞书一键切换提醒(带冷却,仅当前在主时)。不自动切,由用户手动。
const DEGRADE_N = Number(process.env.LLM_DEGRADE_N ?? 3);
const DEGRADE_COOLDOWN_MS = 15 * 60 * 1000;
let consecFail = 0;
let lastAlertAt = 0;

function switchUrl(): string {
  const base = process.env.NEXTAUTH_URL || "https://www.stocktell.me";
  const token = process.env.ADMIN_TOKEN || "";
  return `${base}/api/admin/llm-provider?to=fallback&token=${encodeURIComponent(token)}`;
}

export function noteLLMOutcome(provider: LLMProvider, ok: boolean): void {
  if (provider !== "primary") return; // 只盯主;在兜底上不提醒切换
  if (ok) {
    consecFail = 0;
    return;
  }
  consecFail++;
  if (consecFail < DEGRADE_N) return;
  const now = Date.now();
  if (now - lastAlertAt < DEGRADE_COOLDOWN_MS) return;
  lastAlertAt = now;
  sendFeishu(
    `[LLM 告警] 主 LLM(modelverse)连续 ${consecFail} 次失败/超时,疑似延迟劣化。\n` +
      `一键切到 DeepSeek 兜底(flash):${switchUrl()}\n或到后台 /admin/llm 切换。`
  ).catch(() => {});
}
