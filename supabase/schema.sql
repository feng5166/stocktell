-- StockTell 今日简报表
-- 在 Supabase 控制台 SQL Editor 里执行一次。

create table if not exists public.briefing_items (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  impact       text not null check (impact in ('高','中','低')),
  title        text not null,
  trigger_code text,
  trigger_name text,
  beneficiaries jsonb not null default '[]'::jsonb,
  retail_take  text not null default '',
  source_url   text,
  status       text not null default 'draft' check (status in ('draft','published')),
  created_at   timestamptz not null default now()
);

create index if not exists briefing_items_date_status_idx
  on public.briefing_items (date, status);

-- 行级安全:仅服务端(service_role)写;公开只读已发布内容。
alter table public.briefing_items enable row level security;

drop policy if exists "public read published" on public.briefing_items;
create policy "public read published"
  on public.briefing_items for select
  using (status = 'published');
