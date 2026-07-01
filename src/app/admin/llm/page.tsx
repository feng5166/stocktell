import { requireAdmin } from "@/lib/admin";
import { getActiveProvider, fallbackAvailable } from "@/lib/llm-provider";
import { LlmProviderToggle } from "./LlmProviderToggle";

export const dynamic = "force-dynamic";

export default async function AdminLlmPage() {
  await requireAdmin();
  const provider = await getActiveProvider();
  const hasFallback = fallbackAvailable();
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-lg font-semibold text-gray-900">模型切换</h1>
      <p className="mt-1 text-sm text-gray-500">
        主 LLM(modelverse)延迟劣化时,手动切到 DeepSeek 官方兜底。系统检测到连续失败会飞书提醒你来切。
      </p>
      <LlmProviderToggle initial={provider} hasFallback={hasFallback} />
    </div>
  );
}
