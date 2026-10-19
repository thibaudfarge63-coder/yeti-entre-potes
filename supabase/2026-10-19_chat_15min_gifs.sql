-- Chat vidé toutes les 15 minutes (au lieu de toutes les heures) + cache partagé des GIF GIPHY.

create or replace function yeti_private.chat_since() returns timestamptz language sql stable set search_path to '' as $f$
  select date_trunc('hour', now()) + make_interval(mins => (floor(extract(minute from now()) / 15) * 15)::int);
$f$;

create or replace function yeti_private.purge_messages()
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_n integer;
begin
  delete from yeti_private.messages where created_at < yeti_private.chat_since();
  get diagnostics v_n = row_count; return v_n;
end $function$;

create or replace function public.yeti_get_messages(p_room_code text, p_after bigint default 0)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_room uuid; v jsonb;
begin
  if p_room_code is null or length(p_room_code) not between 4 and 128 then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(p_room_code,'UTF8'));
  if v_room is null then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'player',player,'body',body,'at',created_at) order by id), '[]'::jsonb) into v
  from (select * from yeti_private.messages where room_id = v_room and id > coalesce(p_after,0) and created_at >= yeti_private.chat_since() order by id desc limit 100) m;
  return jsonb_build_object('messages', v, 'since', yeti_private.chat_since());
end $function$;

select cron.schedule('yeti-purge-chat', '*/15 * * * *', 'select yeti_private.purge_messages()');

-- Notif de tag : « a envoyé un GIF » aussi pour les GIF GIPHY ([gif:id]) — voir yeti_send_message (regex '^\[(g|gif):').

-- Cache des réponses GIPHY (rempli par la fonction edge Supabase « yeti-giphy »).
create table if not exists yeti_private.giphy_cache (k text primary key, body jsonb not null, fetched_at timestamptz not null default now());
alter table yeti_private.giphy_cache enable row level security;
revoke all on yeti_private.giphy_cache from public, anon, authenticated;
-- La clé GIPHY est stockée dans yeti_private.settings (clé 'giphy_key'), jamais dans le dépôt.
