import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 有 env 就用 Supabase,没有则返回 null(数据层会回退到本地 JSON)。
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // 服务端写入用 service_role;只读场景可用 anon。优先 service_role。
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}
