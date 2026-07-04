// AUTO-GENERATED from docs/chain-relations-review-v2-audited.csv(负责人 v2 审阅版)。勿手改;重审后重生成。
export const AI_INFRA_UPGRADES: { code:string; name:string; segment:string; relationType:'direct'|'indirect'|'sentiment'; confidence:'low'; reason:string }[] = [
  {
    "code": "000977",
    "name": "浪潮信息",
    "segment": "服务器/算力代工",
    "relationType": "direct",
    "confidence": "low",
    "reason": "AI 服务器整机环节,推理算力落地的直接承载,传导路径短、业务入口明确;后续看 AI 服务器订单、云厂/运营商/政企客户导入、收入占比与毛利率。"
  },
  {
    "code": "002281",
    "name": "光迅科技",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "光模块/光芯片相关，可从 candidate 升间接；需补高速数通光模块/客户/订单证据，不建议直接。"
  },
  {
    "code": "300570",
    "name": "太辰光",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "无源光器件/光模块上游，升间接；说明是上游器件，不是光模块整机直接映射。"
  },
  {
    "code": "002463",
    "name": "沪电股份",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "AI 服务器 PCB，升间接；不是整机直接，后续看 AI 服务器 PCB订单/客户/毛利。"
  },
  {
    "code": "002916",
    "name": "深南电路",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "PCB/封装基板相关，升间接；需 AI 服务器/封装基板收入验证。"
  },
  {
    "code": "300476",
    "name": "胜宏科技",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "高阶 PCB/HDI 可升间接；需 AI 服务器订单和收入占比验证。"
  },
  {
    "code": "600183",
    "name": "生益科技",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "覆铜板属 AI 服务器 PCB 上游材料，升间接；传导隔一层，需订单验证。"
  },
  {
    "code": "688521",
    "name": "芯原股份",
    "segment": "国产算力芯片",
    "relationType": "sentiment",
    "confidence": "low",
    "reason": "芯片 IP/设计平台属国产半导体生态，不是 AI 推理基础设施短传导，先 sentiment 或移入国产芯片链。"
  },
  {
    "code": "301269",
    "name": "华大九天",
    "segment": "国产算力芯片",
    "relationType": "sentiment",
    "confidence": "low",
    "reason": "EDA 属半导体设计工具，建议移入半导体设备/EDA链；若留 AI 推理仅 sentiment。"
  },
  {
    "code": "000063",
    "name": "中兴通讯",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "通信设备/算力服务器/交换网络相关，升间接；建议环节改“服务器/网络设备”，不要放光模块。"
  },
  {
    "code": "000938",
    "name": "紫光股份",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "新华三服务器/交换机相关，升间接；建议环节改“服务器/网络设备”。"
  },
  {
    "code": "002475",
    "name": "立讯精密",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "连接器/算力组件属硬件上游，升间接；需服务器/数据中心订单验证。"
  },
  {
    "code": "002261",
    "name": "拓维信息",
    "segment": "服务器/算力代工",
    "relationType": "sentiment",
    "confidence": "low",
    "reason": "华为昇腾生态映射更偏国产算力情绪/生态，先改 sentiment；需订单/收入证据再考虑 indirect。"
  },
  {
    "code": "300442",
    "name": "润泽科技",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "AIDC/智算集群/液冷运维与算力基础设施相关，升间接；需收入和客户验证。"
  },
  {
    "code": "000988",
    "name": "华工科技",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "数通光模块/激光器相关，升间接；需验证数据中心光模块收入和客户。"
  },
  {
    "code": "688498",
    "name": "源杰科技",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "高速激光器芯片属光模块上游，升间接；需订单/收入验证。"
  },
  {
    "code": "603228",
    "name": "景旺电子",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "多品类 PCB 与 AI 服务器板升级相关，升间接；需客户/订单验证。"
  },
  {
    "code": "002436",
    "name": "兴森科技",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "IC封装基板/高速 PCB，升间接；需封装基板和 AI 服务器链条证据。"
  },
  {
    "code": "603256",
    "name": "宏和科技",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "高端电子级玻纤布/低介电材料属 PCB 上游，升间接但不得直接。"
  },
  {
    "code": "605589",
    "name": "圣泉集团",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "电子材料/树脂属 PCB/封装材料上游，升间接，需 AI 服务器/封装客户验证。"
  },
  {
    "code": "301217",
    "name": "铜冠铜箔",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "电子铜箔属 PCB 上游材料，升间接；传导较远，需订单验证。"
  },
  {
    "code": "301511",
    "name": "德福科技",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "电子电路铜箔属 PCB 上游材料，升间接；传导较远，需订单验证。"
  },
  {
    "code": "300474",
    "name": "景嘉微",
    "segment": "国产算力芯片",
    "relationType": "sentiment",
    "confidence": "low",
    "reason": "国产 GPU 稀缺标的，但和海外 AI 推理链无供货传导，先 sentiment；需订单/收入验证。"
  },
  {
    "code": "603019",
    "name": "中科曙光",
    "segment": "服务器/算力代工",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "国产算力整机/海光关联，可升间接；需整机订单和收入验证。"
  },
  {
    "code": "300563",
    "name": "神宇股份",
    "segment": "铜连接/高速互连(铜)",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "高速线缆/铜连接二线，升间接；需 GB/AI服务器铜连接客户验证。"
  },
  {
    "code": "688702",
    "name": "盛科通信",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "国产交换芯片与 AI 网络相关，升间接；需数据中心交换芯片订单/客户验证。"
  },
  {
    "code": "300620",
    "name": "光库科技",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "薄膜铌酸锂/光器件/CPO 上游，升间接；需验证数据中心客户和收入占比。"
  },
  {
    "code": "603083",
    "name": "剑桥科技",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "数通光模块/CPO 概念，可升间接但置信不高；需客户和订单验证。"
  },
  {
    "code": "688313",
    "name": "仕佳光子",
    "segment": "光模块/高速互连",
    "relationType": "indirect",
    "confidence": "low",
    "reason": "光模块上游器件，升间接；需业务暴露验证。"
  }
];
export const TRIGGER_CLASS: Record<string,{ group:string; chainId:string|null }> = {
  "NVDA": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "AMD": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "AVGO": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "TSM": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "ASML": {
    "group": "semiconductor",
    "chainId": null
  },
  "MU": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "MRVL": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "ARM": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "INTC": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "SMCI": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "DELL": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "ANET": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "VRT": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "MSFT": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "GOOGL": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "AMZN": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "META": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "ORCL": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "PLTR": {
    "group": "ai-application",
    "chainId": "ai-infra"
  },
  "TSLA": {
    "group": "auto-robot",
    "chainId": null
  },
  "CRWV": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "COHR": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "LRCX": {
    "group": "semiconductor",
    "chainId": null
  },
  "AMAT": {
    "group": "semiconductor",
    "chainId": null
  },
  "CDNS": {
    "group": "semiconductor",
    "chainId": null
  },
  "SNPS": {
    "group": "semiconductor",
    "chainId": null
  },
  "DLR": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "LITE": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "FN": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "CIEN": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "IPGP": {
    "group": "semiconductor",
    "chainId": null
  },
  "GLW": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "WDC": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "SNDK": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "STX": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "CLS": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "NBIS": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "CVX": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "LNG": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "GEV": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "BE": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "FLNC": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "AES": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "SMR": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "OKLO": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "UUUU": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "GOOG": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "NOW": {
    "group": "ai-application",
    "chainId": "ai-infra"
  },
  "SNOW": {
    "group": "ai-application",
    "chainId": "ai-infra"
  },
  "LI": {
    "group": "auto-robot",
    "chainId": null
  },
  "XPEV": {
    "group": "auto-robot",
    "chainId": null
  },
  "COIN": {
    "group": "crypto",
    "chainId": null
  },
  "RIOT": {
    "group": "crypto",
    "chainId": null
  },
  "BTDR": {
    "group": "crypto",
    "chainId": null
  },
  "IREN": {
    "group": "crypto",
    "chainId": null
  },
  "GLXY": {
    "group": "crypto",
    "chainId": null
  },
  "CRCL": {
    "group": "crypto",
    "chainId": null
  },
  "RKLB": {
    "group": "aero-defense",
    "chainId": null
  },
  "ASTS": {
    "group": "aero-defense",
    "chainId": null
  },
  "PL": {
    "group": "aero-defense",
    "chainId": null
  },
  "LMT": {
    "group": "aero-defense",
    "chainId": null
  },
  "RTX": {
    "group": "aero-defense",
    "chainId": null
  },
  "AVAV": {
    "group": "aero-defense",
    "chainId": null
  },
  "SITM": {
    "group": "semiconductor",
    "chainId": null
  },
  "RDDT": {
    "group": "ai-application",
    "chainId": "ai-infra"
  },
  "VECO": {
    "group": "semiconductor",
    "chainId": null
  },
  "CRDO": {
    "group": "ai-infra",
    "chainId": "ai-infra"
  },
  "ETN": {
    "group": "data-center-power",
    "chainId": "data-center-power"
  },
  "AMKR": {
    "group": "semiconductor",
    "chainId": null
  },
  "Q": {
    "group": "semiconductor",
    "chainId": null
  },
  "ENTG": {
    "group": "semiconductor",
    "chainId": null
  }
};
