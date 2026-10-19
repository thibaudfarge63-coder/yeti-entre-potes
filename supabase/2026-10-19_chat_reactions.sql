-- Réactions emoji aux messages du chat (une même personne peut mettre plusieurs emojis différents).
create table if not exists yeti_private.chat_reactions (
  msg_id bigint not null references yeti_private.messages(id) on delete cascade,
  player integer not null, emoji text not null, at timestamptz not null default now(),
  primary key (msg_id, player, emoji));
alter table yeti_private.chat_reactions enable row level security;

create or replace function yeti_private.chat_reactions_of(p_room uuid) returns jsonb
language sql stable set search_path to '' as $f$
  select coalesce(jsonb_object_agg(msg_id, r), '{}'::jsonb) from (
    select r.msg_id, jsonb_object_agg(r.emoji, r.players) r from (
      select x.msg_id, x.emoji, jsonb_agg(x.player order by x.at) players, min(x.at) first_at
      from yeti_private.chat_reactions x join yeti_private.messages m on m.id = x.msg_id
      where m.room_id = p_room and m.created_at >= yeti_private.chat_since()
      group by x.msg_id, x.emoji) r group by r.msg_id) t;
$f$;
revoke all on function yeti_private.chat_reactions_of(uuid) from public, anon, authenticated;

-- Ajoute ou retire (bascule) une réaction. Renvoie toutes les réactions du chat.
create or replace function public.yeti_chat_react(p_room_code text, p_player integer, p_token text, p_msg bigint, p_emoji text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code);
begin
  if not yeti_private.session_ok(v_room, p_player, p_token) then raise exception using errcode='22023', message='Reconnecte-toi pour réagir.'; end if;
  if exists (select 1 from yeti_private.players where room_id = v_room and id = p_player and banned_until > now()) then raise exception using errcode='22023', message='Tu es banni pour le moment.'; end if;
  if p_emoji is null or p_emoji not in ('❤️','😂','😮','😢','😡','👍','🔥','💀') then raise exception using errcode='22023', message='Réaction inconnue.'; end if;
  if not exists (select 1 from yeti_private.messages where room_id = v_room and id = p_msg) then raise exception using errcode='22023', message='Ce message a disparu.'; end if;
  if exists (select 1 from yeti_private.chat_reactions where msg_id = p_msg and player = p_player and emoji = p_emoji) then
    delete from yeti_private.chat_reactions where msg_id = p_msg and player = p_player and emoji = p_emoji;
  else
    insert into yeti_private.chat_reactions (msg_id, player, emoji) values (p_msg, p_player, p_emoji);
  end if;
  return jsonb_build_object('ok', true, 'reactions', yeti_private.chat_reactions_of(v_room));
end $function$;
revoke all on function public.yeti_chat_react(text, integer, text, bigint, text) from public;
grant execute on function public.yeti_chat_react(text, integer, text, bigint, text) to anon, authenticated;

-- yeti_presence renvoie aussi les réactions (rafraîchies toutes les 5 s chez chacun).
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
    'reads', (select coalesce(jsonb_object_agg(player, last_read), '{}'::jsonb) from yeti_private.chat_reads where room_id = v_room and at >= yeti_private.chat_since()),
    'reactions', yeti_private.chat_reactions_of(v_room));
end $function$;
