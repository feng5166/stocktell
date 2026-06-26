// 可配置的 LLM 客户端(OpenAI 兼容)。
// 换 provider / 换模型只改环境变量,无需改代码:
//   LLM_BASE_URL  默认 https://api.modelverse.cn/v1
//   LLM_API_KEY   没配则不调用模型(简报走模板回退)
//   LLM_MODEL     默认 glm-5.2(modelverse 上可用:glm-5.2 / qwen3.7-plus / doubao-seed-2-1-pro-260628 / MiniMax-M3 ...)
import OpenAI from "openai";

export const LLM_MODEL = process.env.LLM_MODEL || "glm-5.2";
export const LLM_BASE_URL =
  process.env.LLM_BASE_URL || "https://api.modelverse.cn/v1";

export function getLLM(): OpenAI | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: LLM_BASE_URL });
}
