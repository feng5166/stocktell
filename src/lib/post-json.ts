// 客户端 JSON 请求薄封装(缓修收敛,2026-07-07):此前五处组件各手抄一份
// fetch+headers+json().catch 样板且已开始漂移(有的读 d.error 有的不读)。
// 只统一「取数」不统一「判定」——各调用方的 ok 语义(r.ok && d.ok !== false 等)保留在调用处。
export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" | "PUT" = "POST"
): Promise<{ res: Response; data: T & { ok?: boolean; error?: string } }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({ ok: false }))) as T & { ok?: boolean; error?: string };
  return { res, data };
}
