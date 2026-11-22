-- マイ単語帳 の同期用（Supabase）。Supabase の「SQL Editor」に、全部貼り付けて、Run を押します。
--
-- 仕組み：
--   * 語は、テーブル mytango_words に入ります。1行が1語です。
--   * テーブルには、直接さわれません（RLS を有効にして、許可を何も作らない）。
--   * アプリは、下の3つの関数だけを、公開キー（anon）で呼びます。
--   * 関数には、「同期コード」を渡します。同期コードが合う行だけが、読み書きできます。
--   * 同期コードは、パスワードと同じです。長くて、推測されにくいものにしてください（16文字以上が必須）。

create table if not exists public.mytango_words (
  sync_code  text        not null check (length(sync_code) >= 16),
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (sync_code, id)
);

alter table public.mytango_words enable row level security;   -- 許可（policy）を作らない = 表への直接のアクセスは、すべて拒否

-- 一覧（1000件ずつ取り出す）
create or replace function public.mytango_list(code text, p_offset int default 0, p_limit int default 1000)
returns table (id text, data jsonb)
language sql security definer set search_path = public as $$
  select w.id, w.data
    from public.mytango_words w
   where w.sync_code = code and length(code) >= 16
   order by w.id
   offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 1000);
$$;

-- 追加・更新
create or replace function public.mytango_put(code text, doc_id text, doc jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(code) < 16 then raise exception 'sync code too short'; end if;
  insert into public.mytango_words (sync_code, id, data)
  values (code, doc_id, doc)
  on conflict (sync_code, id) do update set data = excluded.data, updated_at = now();
end;
$$;

-- 削除
create or replace function public.mytango_delete(code text, doc_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(code) < 16 then raise exception 'sync code too short'; end if;
  delete from public.mytango_words where sync_code = code and id = doc_id;
end;
$$;

revoke all on function public.mytango_list(text, int, int) from public;
revoke all on function public.mytango_put(text, text, jsonb) from public;
revoke all on function public.mytango_delete(text, text) from public;
grant execute on function public.mytango_list(text, int, int) to anon;
grant execute on function public.mytango_put(text, text, jsonb) to anon;
grant execute on function public.mytango_delete(text, text) to anon;
