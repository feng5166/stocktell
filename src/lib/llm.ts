// 可配置的 LLM 客户端(OpenAI 兼容)。
// 换 provider / 换模型只改环境变量,无需改代码:
//   LLM_BASE_URL  默认 https://api.modelverse.cn/v1
//   LLM_API_KEY   没配则不调用模型(简报走模板回退)
//   LLM_MODEL     默认 deepseek-v4-pro(推理模型,质量好但较慢;modelverse 上也有 deepseek-v4-flash / glm-5.2 / qwen3.7-plus ...)
import OpenAI from "openai";

export const LLM_MODEL = process.env.LLM_MODEL || "deepseek-v4-pro";
// 交互式场景(如「StockTell 解读」流式深读)用的快模型:pro 是推理模型,
// 流式时先吐一大段 reasoning_content、content 迟迟才来,慢到常撞 maxDuration=用户以为挂了。
// flash 推理短、几秒就开始吐正文,交互体验好得多。生成简报(离线 cron)仍用 LLM_MODEL 保质量。
export const LLM_MODEL_FAST = process.env.LLM_MODEL_FAST || "deepseek-v4-flash";
export const LLM_BASE_URL =
  process.env.LLM_BASE_URL || "https://api.modelverse.cn/v1";

export function getLLM(): OpenAI | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: LLM_BASE_URL });
}
