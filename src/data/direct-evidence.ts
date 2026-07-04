// direct 关系证据层(负责人 2026-07-04 起草待审)。审阅台"证据缺失高亮"要求 direct 必须有 references
// + 证据状态;此表为 13 条 direct 补【法定披露页 references + 验证点】,在 chain-relations 派生后套用。
//
// 铁律:URL 绝不自产。深市/北交所用巨潮资讯确定性披露页(cninfo.com.cn/new/disclosure/stock?stockCode=<code>,
// 与中际旭创既有 insight 同源);沪市(6xxxxx)不写可能出错的 URL,只标"上交所法定披露页"由人按代码检索。
// references 指向"去哪核实",不代表已确认具体数字 → 证据状态多为 partially_verified(诚实,不伪装确定)。
import type { RelationReference } from "./chain-relations";

const cninfo = (code: string, name: string): RelationReference => ({
  title: `${name} · 巨潮资讯法定披露页`,
  url: `http://www.cninfo.com.cn/new/disclosure/stock?stockCode=${code}`,
  sourceType: "exchange_disclosure",
  note: "定期报告 / 业绩快报 / 订单公告原文,以此核实下列验证点",
});
const sse = (name: string): RelationReference => ({
  title: `${name} · 上交所法定披露页`,
  sourceType: "exchange_disclosure",
  note: "上交所定期报告 / 公告原文(www.sse.com.cn 按代码检索),以此核实下列验证点",
});

export type DirectEvidence = {
  verificationPoints: string[];
  references: RelationReference[];
  evidenceStatus?: "verified" | "partially_verified";
  reasonAppend?: string; // 追加到 reason(清"概念词无验证点"旗标)
};

export const DIRECT_EVIDENCE: Record<string, DirectEvidence> = {
  // —— ai-infra ——
  "300308": {
    verificationPoints: ["800G/1.6T 光模块订单与出货节奏", "英伟达 / 北美四大云厂客户导入", "高速率光模块收入占比与毛利率"],
    references: [cninfo("300308", "中际旭创")],
    evidenceStatus: "verified",
  },
  "300502": {
    verificationPoints: ["800G/1.6T 主力二供订单", "海外云厂客户结构与份额", "海外收入占比与毛利率"],
    references: [cninfo("300502", "新易盛")],
    evidenceStatus: "verified",
  },
  "601138": {
    verificationPoints: ["AI 服务器代工订单与出货", "英伟达 / 云厂客户结构", "AI 服务器收入占比与毛利率"],
    references: [sse("工业富联")],
    evidenceStatus: "verified",
    reasonAppend: ";后续看 AI 服务器代工订单、云厂客户结构、收入占比与毛利率。",
  },
  "000977": {
    verificationPoints: ["AI 服务器订单", "运营商 / 云厂 / 政企客户导入", "AI 服务器收入占比与毛利率"],
    references: [cninfo("000977", "浪潮信息")],
    evidenceStatus: "partially_verified", // 由 needs_review 提升(已补披露页 + 验证点)
  },
  // —— data-center-power ——
  "300693": {
    verificationPoints: ["数据中心电源 / HVDC 订单", "数据中心 / IDC 客户导入", "数据中心电力业务收入占比"],
    references: [cninfo("300693", "盛弘股份")],
  },
  "002518": {
    verificationPoints: ["数据中心 UPS / 供电订单", "IDC / 数据中心客户", "数据中心业务收入占比"],
    references: [cninfo("002518", "科士达")],
  },
  "002837": {
    verificationPoints: ["液冷 / 温控订单与项目交付", "数据中心客户导入", "液冷 / 温控收入占比与毛利率"],
    references: [cninfo("002837", "英维克")],
  },
  "301018": {
    verificationPoints: ["数据中心专用空调 / 液冷订单", "数据中心客户导入", "相关业务收入占比"],
    references: [cninfo("301018", "申菱环境")],
  },
  "688676": {
    verificationPoints: ["数据中心变压器 / 供配电订单", "数据中心 / IDC 客户", "相关业务收入占比"],
    references: [sse("金盘科技")],
  },
  "300249": {
    verificationPoints: ["数据中心精密空调订单", "数据中心客户导入", "机房环境业务收入占比"],
    references: [cninfo("300249", "依米康")],
  },
  "603912": {
    verificationPoints: ["机房精密空调订单", "数据中心客户导入", "相关业务收入占比"],
    references: [sse("佳力图")],
  },
  "920808": {
    verificationPoints: ["浸没液冷订单", "高功率数据中心客户", "液冷业务收入占比"],
    references: [cninfo("920808", "曙光数创")],
  },
  "002335": {
    verificationPoints: ["数据中心 UPS / 电源订单", "IDC / 数据中心客户", "数据中心业务收入占比"],
    references: [cninfo("002335", "科华数据")],
  },
};
