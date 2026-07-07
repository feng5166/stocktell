// AI 审阅共享常量(五轮 review 清理②:上限/池宽/单条时长曾在服务端客户端各写一份)
export const AI_REVIEW_MAX_ITEMS = 12; // 一条链一次审完;更大不是时间问题是终审质量问题
export const AI_REVIEW_POOL = 4; // LLM 并发池宽
export const AI_REVIEW_SEC_PER_CALL = 20; // 面板预估用
