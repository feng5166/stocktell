// schema 启动哨兵(五轮 review W1 的结构化解法,2026-07-07)。
// 背景:push-即-部署 + 手动 init-db 的组合,每次改 schema 都存在"代码上线了、库还是旧形态"
// 的窗口期——期间写路径被 fail-safe 静默吞掉,UI 显示成功实际没落库(按源分账索引实踩)。
// 本哨兵在 Node 实例启动时核对【关键形态清单】,漂移即 console.error + 飞书节流告警
// (指引=重跑 /api/admin/init-db)。fail-soft:哨兵自身任何失败都不阻断启动。
//
// 【维护约定】init-db 每加一条改变"表/索引形态"的 DDL,这里同步加一条哨兵——两处相邻改。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.POSTGRES_PRISMA_URL) return; // 本地无库,无形态可核
  try {
    const { getPrisma } = await import("@/lib/prisma");
    const db = getPrisma();
    if (!db) return;
    // 关键形态清单:与 src/app/api/admin/init-db/route.ts 的 DDL 对应
    const SENTINELS: Array<{ index: string; hint: string }> = [
      {
        index: "relation_review_queue_code_chain_id_source_key",
        hint: "relationReviewQueue 按源分账唯一索引(V1)缺失——AI 审阅/用户提交/复盘入队会被旧索引静默吞掉",
      },
      {
        index: "chat_message_user_id_created_at_idx",
        hint: "chat_message 配额计数索引(PR4)缺失——情境追问的 DB 配额查询走全表扫或表根本没建,对话接口会 fail-closed 全拒",
      },
      {
        index: "short_links_code_key",
        hint: "short_links 短码唯一索引(2.3 P0-3 分享短链)缺失——短链创建/302 解析会失败,分享卡二维码扫码打不开",
      },
      {
        index: "pool_requests_pkey",
        hint: "pool_requests 表(2.3 P1-2 池外票登记)缺失——池外票加自选的登记会被静默吞掉,选题看板无数据",
      },
      {
        index: "verify_follows_user_id_code_point_key",
        hint: "verify_follows 唯一索引(2.3 P1-3 验证点跟踪)缺失——关注验证点写入会失败或重复,进展提醒无数据",
      },
      {
        index: "market_intent_daily_segment_ymd_idx",
        hint: "market_intent_daily 表/索引(2.2.2 Market Intent)缺失——每日意图快照写入失败,资金意图层与 Timeline 无数据",
      },
      {
        index: "daily_judgments_subject_ymd_idx",
        hint: "daily_judgments 表/索引(2.2.5 Daily Judgment)缺失——链级判断存档失败,首屏三件事与 Change Detection 无数据底",
      },
    ];
    // 列形态哨兵(索引哨兵覆盖不到 ADD COLUMN 类 DDL)
    const COLUMN_SENTINELS: Array<{ table: string; column: string; hint: string }> = [
      {
        table: "push_subscriptions",
        column: "codes",
        hint: "push_subscriptions.codes(免登录 D1 个性化)缺失——订阅写入会整行失败,新订阅静默丢",
      },
    ];
    const rows = (await db.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE indexname IN (${SENTINELS.map((s) => `'${s.index}'`).join(",")})`
    )) as Array<{ indexname: string }>;
    const present = new Set(rows.map((r) => r.indexname));
    // information_schema.columns 的 table_name/column_name 是 name 域类型:
    // 用行值元组 `(table_name, column_name) IN ((...))` 与文本字面量比较,name↔text
    // 类型协调不可靠会匹配不到 → 误报缺列(2026-08-01 实踩)。改 ::text 显式转换 +
    // OR 组标量比较(与索引哨兵同款可靠口径)。
    const colWhere = COLUMN_SENTINELS.map(
      (c) => `(table_name::text = '${c.table}' AND column_name::text = '${c.column}')`
    ).join(" OR ");
    const colRows = (await db.$queryRawUnsafe(
      `SELECT table_name::text AS table_name, column_name::text AS column_name FROM information_schema.columns WHERE ${colWhere}`
    )) as Array<{ table_name: string; column_name: string }>;
    const colPresent = new Set(colRows.map((r) => `${r.table_name}.${r.column_name}`));
    const missing = [
      ...SENTINELS.filter((s) => !present.has(s.index)).map((m) => ({ key: m.index, hint: m.hint })),
      ...COLUMN_SENTINELS.filter((c) => !colPresent.has(`${c.table}.${c.column}`)).map((c) => ({
        key: `${c.table}.${c.column}`,
        hint: c.hint,
      })),
    ];
    if (missing.length > 0) {
      const msg = missing.map((m) => `缺 ${m.key}:${m.hint}`).join("\n");
      console.error("[schema-sentinel] 生产库形态与代码不一致!\n" + msg);
      const { alertThrottled } = await import("@/lib/monitor");
      await alertThrottled(
        "schema-sentinel",
        `🚨 StockTell schema 哨兵:生产库形态与已部署代码不一致\n${msg}\n处理:POST /api/admin/init-db(Bearer ADMIN_TOKEN,幂等)`,
        6 * 60 * 60 * 1000 // 6h 节流:每实例启动都查,别刷屏
      );
    } else {
      console.log(
        `[schema-sentinel] ${SENTINELS.length + COLUMN_SENTINELS.length} 项关键形态核对通过`
      );
    }
  } catch (e) {
    console.warn("[schema-sentinel] 核对失败(不阻断启动):", e);
  }
}
