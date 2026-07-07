import { requireAdmin } from "@/lib/admin";
import { allRelations } from "@/data/chain-relations";
import { listReviewQueueChecked } from "@/lib/relation-review";
import RelationReviewClient from "./RelationReviewClient";
import ReviewQueuePanel from "./ReviewQueuePanel";

export const dynamic = "force-dynamic";

// P1 关系模型人工校准工作台(负责人审阅台)。读实时 staticRelations,交互编辑(改档/改reason/action)
// 在客户端捕获→导出 diff(审核 schema,可直接回灌 chain-relations-audit)。仅 admin 可见。
// 2.1-W3:顶部加层③ reviewQueue(持久化)——复盘高频未验证/信号多次命中的关系在此人工定夺。
export default async function RelationReviewPage() {
  await requireAdmin();
  const { items: queue, readFailed } = await listReviewQueueChecked("pending");
  return (
    <div>
      <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          审阅队列 · 待人工定夺({queue.length})
        </h2>
        {readFailed && (
          <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            队列读取失败(DB 异常)——下方为空【不代表】没有待审条目,请刷新重试
          </div>
        )}
        <ReviewQueuePanel items={queue} />
      </div>
      <RelationReviewClient relations={allRelations()} />
    </div>
  );
}
