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
    const colRows = (await db.$queryRawUnsafe(
      `SELECT table_name, column_name FROM information_schema.columns WHERE (table_name, column_name) IN (${COLUMN_SENTINELS.map((c) => `('${c.table}','${c.column}')`).join(",")})`
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
