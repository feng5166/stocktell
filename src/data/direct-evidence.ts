// direct 关系证据层(负责人 2026-07-04 审阅通过)。审阅台"证据缺失高亮"要求 direct 必须有 references
// + 证据状态;此表为 13 条 direct 补【法定披露入口 references + 验证点】,在 chain-relations 派生后套用。
//
// 铁律:URL 绝不自产具体公告链接。深市/北交所用巨潮资讯确定性披露页(cninfo.com.cn/new/disclosure/stock
// ?stockCode=<code>);沪市用上交所【公告检索入口】(www.sse.com.cn/disclosure/listedinfo/announcement/,
// 按代码检索)——是稳定入口页、非编造的具体公告 URL。references 指向"去哪核实",不代表数字已核。
//
// 证据状态定义(负责人拍板,防误用):
//   verified          = 已有较稳定一手披露入口,且业务入口与该链核心环节高度一致;【不代表】具体订单/收入已逐项核实。
//   partially_verified = 有一手披露入口、业务方向相关,但具体订单/客户/收入占比/毛利率仍需进一步核验。
//   needs_review/missing = 无一手披露入口或证据不足。
// 前台不展示英文档("verified"易被误读成"已确认受益"),用 EVIDENCE_LABEL 映射为
//   已接入披露源 / 部分待核验 / 待补来源(见 lib/relation-rank.ts)。
//
// 验证点统一四段式:订单 / 客户 / 收入占比 / 毛利率(前台展示稳定)。
import type { RelationReference } from "./chain-relations";

const cninfo = (code: string, name: string): RelationReference => ({
  title: `${name} · 巨潮资讯法定披露页`,
  url: `http://www.cninfo.com.cn/new/disclosure/stock?stockCode=${code}`,
  sourceType: "exchange_disclosure",
  note: "定期报告 / 业绩快报 / 订单公告原文,以此核实下列验证点",
});
const sse = (code: string, name: string): RelationReference => ({
  title: `${name} · 上交所上市公司公告检索`,
  url: "http://www.sse.com.cn/disclosure/listedinfo/announcement/",
  sourceType: "exchange_disclosure",
  note: `按代码 ${code} 检索年报、公告与业务披露,以此核实下列验证点`,
});

export type DirectEvidence = {
  verificationPoints: string[]; // 四段式:订单 / 客户 / 收入占比 / 毛利率
  references: RelationReference[];
  evidenceStatus?: "verified" | "partially_verified";
  reasonAppend?: string; // 追加到 reason(清"概念词无验证点"旗标)
};

export const DIRECT_EVIDENCE: Record<string, DirectEvidence> = {
  // —— ai-infra ——
  "300308": {
    verificationPoints: ["800G/1.6T 光模块订单", "北美云厂客户", "收入占比", "毛利率"],
    references: [cninfo("300308", "中际旭创")],
    evidenceStatus: "verified",
  },
  "300502": {
    verificationPoints: ["800G/1.6T 二供订单", "海外云厂客户", "收入占比", "毛利率"],
    references: [cninfo("300502", "新易盛")],
    evidenceStatus: "verified",
  },
  "601138": {
    verificationPoints: ["AI 服务器代工订单", "英伟达 / 云厂客户", "收入占比", "毛利率"],
    references: [sse("601138", "工业富联")],
    evidenceStatus: "verified",
    reasonAppend: ";后续看 AI 服务器代工订单、云厂客户、收入占比、毛利率。",
  },
  "000977": {
    verificationPoints: ["AI 服务器订单", "运营商 / 云厂 / 政企客户", "收入占比", "毛利率"],
    references: [cninfo("000977", "浪潮信息")],
    evidenceStatus: "partially_verified", // 由 needs_review 提升(已补披露页 + 验证点)
  },
  // —— data-center-power ——
  "300693": {
    verificationPoints: ["数据中心电源 / HVDC 订单", "IDC 客户", "收入占比", "毛利率"],
    references: [cninfo("300693", "盛弘股份")],
  },
  "002518": {
    verificationPoints: ["数据中心 UPS / 供电订单", "IDC 客户", "收入占比", "毛利率"],
    references: [cninfo("002518", "科士达")],
  },
  "002837": {
    verificationPoints: ["液冷 / 温控订单", "数据中心客户", "收入占比", "毛利率"],
    references: [cninfo("002837", "英维克")],
  },
  "301018": {
    verificationPoints: ["数据中心专用空调 / 液冷订单", "数据中心客户", "收入占比", "毛利率"],
    references: [cninfo("301018", "申菱环境")],
  },
  "688676": {
    verificationPoints: ["数据中心变压器 / 供配电订单", "数据中心客户", "收入占比", "毛利率"],
    references: [sse("688676", "金盘科技")],
  },
  "300249": {
    verificationPoints: ["数据中心精密空调订单", "数据中心客户", "收入占比", "毛利率"],
    references: [cninfo("300249", "依米康")],
  },
  "603912": {
    verificationPoints: ["机房精密空调订单", "数据中心客户", "收入占比", "毛利率"],
    references: [sse("603912", "佳力图")],
  },
  "920808": {
    verificationPoints: ["浸没液冷订单", "高功率数据中心客户", "收入占比", "毛利率"],
    references: [cninfo("920808", "曙光数创")],
  },
  "002335": {
    verificationPoints: ["数据中心 UPS / 电源订单", "IDC 客户", "收入占比", "毛利率"],
    references: [cninfo("002335", "科华数据")],
  },
};
