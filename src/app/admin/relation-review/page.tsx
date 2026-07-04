import { requireAdmin } from "@/lib/admin";
import { allRelations } from "@/data/chain-relations";
import RelationReviewClient from "./RelationReviewClient";

export const dynamic = "force-dynamic";

// P1 关系模型人工校准工作台(负责人审阅台)。读实时 staticRelations,交互编辑(改档/改reason/action)
// 在客户端捕获→导出 diff(审核 schema,可直接回灌 chain-relations-audit)。仅 admin 可见。
export default async function RelationReviewPage() {
  await requireAdmin();
  return <RelationReviewClient relations={allRelations()} />;
}
