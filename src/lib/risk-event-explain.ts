export type RiskEventForExplain = {
  kind: string;
  severity: "high" | "mid" | "info";
  text: string;
  date?: string | null;
};

export type RiskEventExplanation = {
  level: "风险提醒" | "重点关注" | "重要事项";
  conclusion: string;
  why: string;
  verify: string;
};

// 把公司行为从“事件标签”翻译成用户能理解的判断框架。
// 这里只解释为什么要关注、还需验证什么，不把单一公告直接推导为涨跌结论。
export function explainRiskEvent(event: RiskEventForExplain): RiskEventExplanation {
  const level =
    event.severity === "high"
      ? "风险提醒"
      : event.severity === "mid"
      ? "重点关注"
      : "重要事项";

  switch (event.kind) {
    case "回购": {
      const stage = event.text.includes("预案")
        ? "当前披露的是回购预案，计划不等于已经执行。"
        : event.text.includes("完成")
        ? "公告显示回购已经完成，但仍要结合实际规模判断影响。"
        : "公告显示回购已进入实施阶段，仍需跟踪最终完成度。";
      return {
        level: "重要事项",
        conclusion: `这不是负面雷区。${stage}`,
        why: "回购会影响流通筹码和市场预期，所以列入公司重要事项跟踪；但不能只凭“回购”二字判断强弱。",
        verify: "看累计实际回购金额与股数、占总股本比例、成交价格区间，以及是否延期或终止。",
      };
    }
    case "增持":
      return {
        level: "重要事项",
        conclusion: "这不是负面雷区。股东增持表达了真实资金动作，但不等于公司基本面已经改善。",
        why: "增持会改变股东持仓和市场预期，因此作为公司重要事项保留跟踪。",
        verify: "看增持主体、实际增持比例与金额、计划完成度，以及后续经营数据是否同步改善。",
      };
    case "减持":
      return {
        level,
        conclusion: "这是筹码供给侧的风险提醒，但减持公告不等于股份会一次性卖出。",
        why: "股东减持可能增加流通盘供给，也可能影响市场对股东信心的判断。",
        verify: "看减持主体、计划上限、实施窗口、已完成比例，以及大宗交易或集中竞价的实际进展。",
      };
    case "解禁":
      return {
        level,
        conclusion: "这是潜在筹码压力，不是“解禁就会跌”的结论。",
        why: "限售股转为可流通后，市场可售筹码增加；压力大小取决于解禁比例和持有人是否真的减持。",
        verify: "看解禁股东性质、占流通盘比例、是否同步披露减持，以及解禁日前后的成交承接。",
      };
    case "质押":
      return {
        level,
        conclusion: "这是股东资金弹性的风险提醒，不代表已经触发平仓。",
        why: "较高质押比例会放大股价下行时的补充担保或处置压力，并可能限制股东后续融资空间。",
        verify: "看质押主体、质押到期日、是否补充质押或解除质押，以及公司是否披露平仓风险。",
      };
    case "ST":
      return {
        level: "风险提醒",
        conclusion: "这是交易所明确的风险警示，不是 StockTell 自行给出的负面标签。",
        why: "ST / *ST 通常对应财务、经营、审计或规范运作方面的明确风险条件。",
        verify: "看风险警示原因、整改进展、最近一期审计意见，以及申请撤销风险警示所需条件。",
      };
    default:
      return {
        level,
        conclusion: "这是一条需要跟踪的公司重要事项，暂不能仅凭单一事件判断影响方向。",
        why: "它可能改变筹码、股东行为或市场预期，因此进入 StockTell 的事项跟踪。",
        verify: "继续核对公司公告中的实际进展、金额占比和后续状态变化。",
      };
  }
}
