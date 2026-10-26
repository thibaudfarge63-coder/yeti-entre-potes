-- 26 oct. 2026 : heure de début des parties + notifications de jeu réduites à un seul rappel par tour.
-- 1) Heure de début (started_at) pour les petits chameaux et le Skull King, renvoyée par les listes. Duels : answered_at.
alter table yeti_private.camel_games add column if not exists started_at timestamptz;
alter table yeti_private.sk_games add column if not exists started_at timestamptz;
update yeti_private.camel_games set started_at = created_at where started_at is null and status <> 'lobby';
update yeti_private.sk_games set started_at = created_at where started_at is null and status <> 'lobby';
create or replace function yeti_private.set_started_at() returns trigger language plpgsql set search_path to '' as $$
begin
  if new.status <> 'lobby' and new.started_at is null then new.started_at := now(); end if;
  return new;
end $$;
drop trigger if exists camel_started on yeti_private.camel_games;
create trigger camel_started before insert or update on yeti_private.camel_games for each row execute function yeti_private.set_started_at();
drop trigger if exists sk_started on yeti_private.sk_games;
create trigger sk_started before insert or update on yeti_private.sk_games for each row execute function yeti_private.set_started_at();

create or replace function public.yeti_camel_list(p_room_code text) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_room uuid := yeti_private.room_of(p_room_code);
begin
  return jsonb_build_object('games', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'host', host, 'seats', to_jsonb(seats), 'seat_state', to_jsonb(seat_state),
      'need', need, 'winner', winner, 'turn', (state->>'turn')::int, 'die', state->'die', 'seq', coalesce((state->>'seq')::int, 0),
      'home', (select jsonb_agg((select count(*) from jsonb_array_elements_text(x.state->'h'->gs.s) as t(v) where t.v::int = 62) order by gs.s) from generate_series(0, 3) as gs(s)),
      'created_at', created_at, 'started_at', started_at, 'moved_at', moved_at, 'finished_at', finished_at) order by id desc)
    from (select * from yeti_private.camel_games where room_id = v_room and (status <> 'done' or finished_at > now() - interval '3 days')
          order by id desc limit 30) x), '[]'::jsonb));
end $function$;

create or replace function public.yeti_sk_list(p_room_code text) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_room uuid := yeti_private.room_of(p_room_code);
begin
  return jsonb_build_object('games', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'host', host, 'seats', to_jsonb(seats), 'seat_state', to_jsonb(seat_state),
      'config', config, 'version', version, 'created_at', created_at, 'started_at', started_at, 'moved_at', moved_at, 'finished_at', finished_at,
      'round', coalesce((state->>'round')::int, 0), 'R', coalesce((state->>'R')::int, (config->>'rounds')::int), 'phase', state->>'phase',
      'turn', state->'turn', 'players', state->'players', 'scores', state->'scores',
      'waiting', case when state->>'phase' = 'bid' then (select coalesce(jsonb_agg(state->'players'->(i::int - 1)), '[]'::jsonb) from jsonb_array_elements(state->'bids') with ordinality b(v, i) where b.v = 'null'::jsonb)
                      when state->'turn' is not null and state->'turn' <> 'null'::jsonb then jsonb_build_array(state->'players'->((state->>'turn')::int)) else '[]'::jsonb end) order by id desc)
    from (select * from yeti_private.sk_games where room_id = v_room and (status <> 'done' or finished_at > now() - interval '3 days') order by id desc limit 30) x), '[]'::jsonb));
end $function$;

create or replace function public.yeti_get_state(p_room_code text) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_room uuid; v_scores jsonb; v_players jsonb; v_duels jsonb; v_daily jsonb; v_groups jsonb;
begin
  v_room := yeti_private.room_of(p_room_code);
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'player',player,'played_at',played_at,'score',score,'mode',mode,'ref',ref)) order by played_at, id), '[]'::jsonb)
    into v_scores from yeti_private.scores where room_id = v_room and not is_test;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'skins',skins,'total',total_throws,
      'locked', pin_hash is not null, 'admin', is_admin, 'mod', is_mod or is_admin, 'muted', chat_muted, 'chat', chat_name, 'banned_until', case when banned_until > now() then banned_until end) order by id), '[]'::jsonb)
    into v_players from yeti_private.players where room_id = v_room;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'challenger',challenger,'opponent',opponent,'throws',throws,'status',status,'created_at',created_at,
           'started_at', case when status = 'accepted' then answered_at end,
           'c_n',c_n,'c_sum',c_sum,'o_n',o_n,'o_sum',o_sum,
           'game', nullif(game,'yeti'), 'ply', case when game <> 'yeti' then ply end, 'winner', winner, 'finished_at', finished_at,
           'moved_at', case when game <> 'yeti' then coalesce(moved_at, answered_at) end,
           'turn', case when game = 'chess' and status = 'accepted' and finished_at is null then
                          case when ply % 2 = 0 then (gstate->>'white')::int else (case when (gstate->>'white')::int = challenger then opponent else challenger end) end
                        when game = 'naval' and status = 'accepted' and finished_at is null then
                          case when gstate->>'phase' = 'play' then (gstate->>'turn')::int end end,
           'placed', case when game = 'naval' and gstate->>'phase' = 'place' then (select jsonb_agg(k::int) from jsonb_object_keys(gstate->'fleets') k) end
         )) order by id), '[]'::jsonb)
    into v_duels from yeti_private.duels where room_id = v_room and (status = 'accepted' or created_at > now() - interval '45 days');
  select coalesce(jsonb_agg(jsonb_build_object('day',day,'player',player,'n',n,'total',total) order by day, player), '[]'::jsonb)
    into v_daily from yeti_private.daily_results where room_id = v_room;
  select coalesce(jsonb_agg(jsonb_build_object('tag',tag,'members',members) order by tag), '[]'::jsonb)
    into v_groups from yeti_private.mention_groups where room_id = v_room;
  return jsonb_build_object('players',v_players,'scores',v_scores,'duels',v_duels,'daily',v_daily,'groups',v_groups,'server_time',now());
end $function$;

-- 2) Notifications. L'ancien envoi devient yeti_private.push_send ; yeti_private.push filtre :
--    * jeux (tags game-, duel-, camel-, skull-) : plus rien d'immédiat, seulement le rappel ci-dessous ;
--    * autres notifs : pas deux fois la même (même tag) au même joueur en moins d'une minute.
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'yeti_private' and p.proname = 'push_send') then
    alter function yeti_private.push(uuid, integer[], text, text, text, text) rename to push_send;
  end if;
end $$;
revoke all on function yeti_private.push_send(uuid, integer[], text, text, text, text) from public, anon, authenticated;

create table if not exists yeti_private.push_log (room_id uuid not null, player integer not null, tag text not null, at timestamptz not null default now());
create index if not exists push_log_idx on yeti_private.push_log (room_id, player, tag, at);
alter table yeti_private.push_log enable row level security;
revoke all on yeti_private.push_log from public, anon, authenticated;

create or replace function yeti_private.push(p_room uuid, p_players integer[], p_title text, p_body text, p_url text, p_tag text) returns void
language plpgsql security definer set search_path to '' as $$
declare v integer[]; t text := coalesce(p_tag, '');
begin
  if t ~ '^(game|duel|camel|skull)-' then return; end if;
  select array_agg(distinct x) into v from unnest(p_players) x
    where t = 'test' or not exists (select 1 from yeti_private.push_log l where l.room_id = p_room and l.player = x and l.tag = t and l.at > now() - interval '1 minute');
  if v is null then return; end if;
  insert into yeti_private.push_log (room_id, player, tag) select p_room, x, t from unnest(v) x;
  perform yeti_private.push_send(p_room, v, p_title, p_body, p_url, p_tag);
end $$;
revoke all on function yeti_private.push(uuid, integer[], text, text, text, text) from public, anon, authenticated;

-- 3) Rappel unique : c'est ton tour (ou une invitation t'attend) depuis 1 min et tu n'es pas sur le site.
create table if not exists yeti_private.turn_pings (kind text not null, game_id bigint not null, player integer not null, key text not null,
  at timestamptz not null default now(), primary key (kind, game_id, player, key));
alter table yeti_private.turn_pings enable row level security;
revoke all on yeti_private.turn_pings from public, anon, authenticated;

create or replace function yeti_private.pname(p_room uuid, p_id integer) returns text language sql stable security definer set search_path to '' as $$
  select coalesce((select name from yeti_private.players where room_id = p_room and id = p_id), 'Un pote') $$;

create or replace function yeti_private.turn_todo() returns table (kind text, game_id bigint, room_id uuid, who integer, key text, since timestamptz, title text, body text, url text)
language sql stable security definer set search_path to '' as $$
  -- duels (yéti, échecs, bataille navale) : défi sans réponse
  select 'duel', d.id, d.room_id, d.opponent::int, 'invite', d.created_at,
    '⚔️ ' || yeti_private.pname(d.room_id, d.challenger) || ' te défie ' || case d.game when 'chess' then 'aux échecs' when 'naval' then 'à la bataille navale' else 'au Yéti' end,
    'Accepte ou refuse le défi dans Duels 1v1.', '?open=duel'
  from yeti_private.duels d where d.status = 'pending'
  union all
  -- duel Yéti accepté : il te reste des lancers
  select 'duel', d.id, d.room_id, x.p, 'throws', d.answered_at,
    '🏔️ Ton duel Yéti t’attend', 'Il te reste ' || (d.throws - x.n) || ' lancer' || case when d.throws - x.n > 1 then 's' else '' end || ' contre ' || yeti_private.pname(d.room_id, x.o) || '.', '?open=duel'
  from yeti_private.duels d
  cross join lateral (values (d.challenger::int, d.c_n::int, d.opponent::int), (d.opponent::int, d.o_n::int, d.challenger::int)) x(p, n, o)
  where d.game = 'yeti' and d.status = 'accepted' and d.finished_at is null and x.n < d.throws and d.answered_at is not null
  union all
  -- échecs : au joueur dont c'est le tour
  select 'duel', d.id, d.room_id, t.p, 'ply' || d.ply, coalesce(d.moved_at, d.answered_at),
    '♟️ À toi de jouer aux échecs !', yeti_private.pname(d.room_id, case when t.p = d.challenger then d.opponent else d.challenger end) || ' attend ton coup.', '?open=game&id=' || d.id
  from yeti_private.duels d
  cross join lateral (select case when d.ply % 2 = 0 then (d.gstate->>'white')::int else (case when (d.gstate->>'white')::int = d.challenger then d.opponent else d.challenger end) end) t(p)
  where d.game = 'chess' and d.status = 'accepted' and d.finished_at is null
  union all
  -- bataille navale : flotte à placer
  select 'duel', d.id, d.room_id, x.p, 'place', coalesce(d.moved_at, d.answered_at),
    '🚢 Place ta flotte !', yeti_private.pname(d.room_id, case when x.p = d.challenger then d.opponent else d.challenger end) || ' attend pour la bataille navale.', '?open=game&id=' || d.id
  from yeti_private.duels d cross join lateral (values (d.challenger::int), (d.opponent::int)) x(p)
  where d.game = 'naval' and d.status = 'accepted' and d.finished_at is null and d.gstate->>'phase' = 'place' and not ((d.gstate->'fleets') ? x.p::text)
  union all
  -- bataille navale : à toi de tirer
  select 'duel', d.id, d.room_id, (d.gstate->>'turn')::int, 'ply' || d.ply, coalesce(d.moved_at, d.answered_at),
    '🚢 À toi de tirer !', yeti_private.pname(d.room_id, case when (d.gstate->>'turn')::int = d.challenger then d.opponent else d.challenger end) || ' attend ton tir.', '?open=game&id=' || d.id
  from yeti_private.duels d where d.game = 'naval' and d.status = 'accepted' and d.finished_at is null and d.gstate->>'phase' = 'play'
  union all
  -- petits chameaux : invitation
  select 'camel', g.id, g.room_id, g.seats[i]::int, 'invite', g.created_at,
    '🐪 ' || yeti_private.pname(g.room_id, g.host) || ' t’invite aux petits chameaux', 'Rejoins la partie dans Compétitions › Petits chameaux.', '?open=camel&id=' || g.id
  from yeti_private.camel_games g cross join lateral generate_subscripts(g.seats, 1) i
  where g.status = 'lobby' and g.seat_state[i] = 'invited'
  union all
  -- petits chameaux : à toi de lancer le dé
  select 'camel', g.id, g.room_id, g.seats[(g.state->>'turn')::int + 1]::int, 'm' || floor(extract(epoch from g.moved_at))::bigint, g.moved_at,
    '🐪 À toi de jouer aux petits chameaux !', 'Lance le dé, la partie t’attend.', '?open=camel&id=' || g.id
  from yeti_private.camel_games g
  where g.status = 'playing' and yeti_private.cam_human(g.seats, g.seat_state, (g.state->>'turn')::int)
  union all
  -- Skull King : invitation
  select 'skull', g.id, g.room_id, g.seats[i]::int, 'invite', g.created_at,
    '☠️ ' || yeti_private.pname(g.room_id, g.host) || ' t’invite au Skull King', 'Rejoins la partie dans Compétitions › Skull King.', '?open=skull&id=' || g.id
  from yeti_private.sk_games g cross join lateral generate_subscripts(g.seats, 1) i
  where g.status = 'lobby' and g.seat_state[i] = 'invited'
  union all
  -- Skull King : pari à faire
  select 'skull', g.id, g.room_id, (g.state->'players'->>(b.i::int - 1))::int, 'r' || (g.state->>'round') || '-bid', g.moved_at,
    '☠️ Skull King : manche ' || (g.state->>'round'), 'À toi de parier !', '?open=skull&id=' || g.id
  from yeti_private.sk_games g cross join lateral jsonb_array_elements(g.state->'bids') with ordinality b(v, i)
  where g.status = 'playing' and g.state->>'phase' = 'bid' and b.v = 'null'::jsonb
  union all
  -- Skull King : à toi de poser une carte
  select 'skull', g.id, g.room_id, (g.state->'players'->>((g.state->>'turn')::int))::int, 'v' || g.version, g.moved_at,
    '☠️ Skull King : à toi de jouer !', 'Pose ta carte, la table t’attend.', '?open=skull&id=' || g.id
  from yeti_private.sk_games g
  where g.status = 'playing' and g.state->>'phase' in ('play', 'salvo', 'plank') and jsonb_typeof(g.state->'turn') = 'number'
$$;
revoke all on function yeti_private.turn_todo() from public, anon, authenticated;

create or replace function yeti_private.turn_reminders(p_seed boolean default false) returns integer
language plpgsql security definer set search_path to '' as $$
declare r record; n integer := 0; ins integer;
begin
  for r in select * from yeti_private.turn_todo() t
           where t.who is not null and t.since is not null and (p_seed or (t.since <= now() - interval '1 minute' and t.since > now() - interval '12 hours'))
  loop
    if exists (select 1 from yeti_private.turn_pings p where p.kind = r.kind and p.game_id = r.game_id and p.player = r.who and p.key = r.key) then continue; end if;
    -- sur le site en ce moment : pas de notif, on retente au prochain passage
    if not p_seed and exists (select 1 from yeti_private.presence pr where pr.room_id = r.room_id and pr.player = r.who and pr.last_seen > now() - interval '30 seconds') then continue; end if;
    insert into yeti_private.turn_pings (kind, game_id, player, key) values (r.kind, r.game_id, r.who, r.key) on conflict do nothing;
    get diagnostics ins = row_count;
    if ins > 0 and not p_seed then
      perform yeti_private.push_send(r.room_id, array[r.who], r.title, r.body, r.url, r.kind || '-' || r.game_id);
      n := n + 1;
    end if;
  end loop;
  delete from yeti_private.turn_pings where at < now() - interval '7 days';
  delete from yeti_private.push_log where at < now() - interval '1 day';
  return n;
end $$;
revoke all on function yeti_private.turn_reminders(boolean) from public, anon, authenticated;

-- Rien d'ancien n'est envoyé au démarrage : les tours déjà en attente sont marqués comme notifiés.
select yeti_private.turn_reminders(true);
select cron.unschedule('yeti-turn-reminders') where exists (select 1 from cron.job where jobname = 'yeti-turn-reminders');
select cron.schedule('yeti-turn-reminders', '20 seconds', 'select yeti_private.turn_reminders()');
select jobname, schedule from cron.job;
