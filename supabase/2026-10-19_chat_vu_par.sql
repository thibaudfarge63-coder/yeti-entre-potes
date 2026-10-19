-- « Vu par … » dans le chat : on retient le dernier message lu par chaque joueur (chat ouvert).
create table if not exists yeti_private.chat_reads (
  room_id uuid not null, player integer not null, last_read bigint not null default 0, at timestamptz not null default now(),
  primary key (room_id, player));
alter table yeti_private.chat_reads enable row level security;

create or replace function public.yeti_chat_seen(p_room_code text, p_player integer, p_token text, p_msg bigint)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code);
begin
  if not yeti_private.session_ok(v_room, p_player, p_token) then return jsonb_build_object('ok', false); end if;
  if not exists (select 1 from yeti_private.messages where room_id = v_room and id = p_msg) then return jsonb_build_object('ok', false); end if;
  insert into yeti_private.chat_reads (room_id, player, last_read, at) values (v_room, p_player, p_msg, now())
  on conflict (room_id, player) do update set last_read = greatest(yeti_private.chat_reads.last_read, excluded.last_read), at = now();
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.yeti_chat_seen(text, integer, text, bigint) from public;
grant execute on function public.yeti_chat_seen(text, integer, text, bigint) to anon, authenticated;

-- yeti_presence renvoie aussi qui a lu jusqu'où (dans la fenêtre de 15 min du chat).
create or replace function public.yeti_presence(p_room_code text, p_player integer default null::integer)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code);
begin
  if p_player is not null and p_player > 0 and exists (select 1 from yeti_private.players where room_id = v_room and id = p_player and not coalesce(banned_until > now(), false)) then
    insert into yeti_private.presence (room_id, player, last_seen) values (v_room, p_player, now())
    on conflict (room_id, player) do update set last_seen = excluded.last_seen;
  end if;
  return jsonb_build_object(
    'online', (select coalesce(jsonb_agg(s.player order by s.player), '[]'::jsonb) from yeti_private.presence s join yeti_private.players p on p.room_id = s.room_id and p.id = s.player
               where s.room_id = v_room and s.last_seen > now() - interval '30 seconds' and not coalesce(p.banned_until > now(), false)),
    'bans', (select coalesce(jsonb_object_agg(id, banned_until), '{}'::jsonb) from yeti_private.players where room_id = v_room and banned_until > now()),
    'reads', (select coalesce(jsonb_object_agg(player, last_read), '{}'::jsonb) from yeti_private.chat_reads where room_id = v_room and at >= yeti_private.chat_since()));
end $function$;
