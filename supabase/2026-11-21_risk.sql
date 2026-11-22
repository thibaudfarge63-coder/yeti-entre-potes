-- Risk (21 nov. 2026) : table des parties, fonctions réservées au rôle service (fonction Edge yeti-risk),
-- liste/version pour le site, notifications de tour, alerte admins après 2 min, résultats pour le Hall of Fame.

create table if not exists yeti_private.rk_games (
  id bigserial primary key,
  room_id uuid not null,
  host smallint not null,
  seats smallint[] not null,          -- joueurs humains (ids), l'organisateur en premier
  seat_state text[] not null,         -- host / joined / invited
  status text not null default 'lobby',
  config jsonb not null default '{}', -- {bots: ['easy'|'normal'|'hard', …], missions: true}
  state jsonb,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  moved_at timestamptz not null default now(),
  finished_at timestamptz,
  started_at timestamptz
);
create index if not exists rk_games_room on yeti_private.rk_games (room_id, id desc);
alter table yeti_private.rk_games enable row level security;

create or replace function public.rk_open(p_code text, p_player integer, p_token text, p_game bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_room uuid; v_me int := 0; g yeti_private.rk_games;
begin
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(coalesce(p_code, ''), 'UTF8'));
  if v_room is null then return jsonb_build_object('room', null); end if;
  if p_player is not null and p_token is not null and yeti_private.session_ok(v_room, p_player, p_token) then v_me := p_player; end if;
  if p_game is not null then select * into g from yeti_private.rk_games where id = p_game and room_id = v_room; end if;
  return jsonb_build_object('room', v_room, 'me', v_me,
    'name', (select name from yeti_private.players where room_id = v_room and id = v_me),
    'boss', coalesce((select is_admin or is_mod from yeti_private.players where room_id = v_room and id = v_me), false),
    'row', case when g.id is null then null else to_jsonb(g) end);
end $$;

create or replace function public.rk_insert(p_room uuid, p_host integer, p_seats integer[], p_config jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare g yeti_private.rk_games; n int;
begin
  select count(*) into n from yeti_private.players where room_id = p_room and id = any(p_seats) and (banned_until is null or banned_until < now());
  if n <> cardinality(p_seats) then raise exception 'Invité introuvable ou banni.'; end if;
  insert into yeti_private.rk_games (room_id, host, seats, seat_state, status, config)
    values (p_room, p_host, p_seats::smallint[], array['host'] || array_fill('invited'::text, array[cardinality(p_seats) - 1]), 'lobby', p_config)
    returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.rk_save(p_game bigint, p_version integer, p_seats integer[], p_seat_state text[], p_status text, p_state jsonb, p_finished boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare g yeti_private.rk_games;
begin
  update yeti_private.rk_games set seats = p_seats::smallint[], seat_state = p_seat_state, status = p_status, state = p_state,
    version = version + 1, moved_at = now(), finished_at = case when p_finished then coalesce(finished_at, now()) else finished_at end
    where id = p_game and version = p_version returning * into g;
  return case when g.id is null then null else to_jsonb(g) end;
end $$;

create or replace function public.rk_delete(p_game bigint, p_version integer)
returns boolean language sql security definer set search_path to '' as $$
  with d as (delete from yeti_private.rk_games where id = p_game and version = p_version returning 1) select exists(select 1 from d) $$;

revoke all on function public.rk_open(text, integer, text, bigint), public.rk_insert(uuid, integer, integer[], jsonb),
  public.rk_save(bigint, integer, integer[], text[], text, jsonb, boolean), public.rk_delete(bigint, integer) from public, anon, authenticated;
grant execute on function public.rk_open(text, integer, text, bigint), public.rk_insert(uuid, integer, integer[], jsonb),
  public.rk_save(bigint, integer, integer[], text[], text, jsonb, boolean), public.rk_delete(bigint, integer) to service_role;

-- Liste des parties du groupe (sans les mains ni les missions)
create or replace function public.yeti_rk_list(p_room_code text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code);
begin
  return jsonb_build_object('games', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'host', host, 'seats', to_jsonb(seats), 'seat_state', to_jsonb(seat_state),
      'config', config, 'version', version, 'created_at', created_at, 'started_at', started_at, 'moved_at', moved_at, 'finished_at', finished_at,
      'round', coalesce((state->>'round')::int, 0), 'phase', state->>'phase', 'turn', state->'turn', 'players', state->'players', 'alive', state->'alive',
      'winner', state->'winner',
      'territories', (select jsonb_agg(c) from (select count(*) filter (where value::int = s) c from generate_series(0, coalesce(jsonb_array_length(state->'players'), 0) - 1) s
                        left join jsonb_each_text(state->'owner') on true group by s order by s) z),
      'waiting', case when state is null then '[]'::jsonb
                      when state->>'phase' = 'setup' then (select coalesce(jsonb_agg(state->'players'->(i::int - 1)), '[]'::jsonb) from jsonb_array_elements(state->'setupDone') with ordinality b(v, i) where b.v = 'false'::jsonb)
                      when jsonb_typeof(state->'turn') = 'number' then jsonb_build_array(state->'players'->((state->>'turn')::int)) else '[]'::jsonb end) order by id desc)
    from (select * from yeti_private.rk_games where room_id = v_room and (status <> 'done' or finished_at > now() - interval '3 days') order by id desc limit 30) x), '[]'::jsonb));
end $$;

create or replace function public.yeti_rk_version(p_room_code text, p_game bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code);
begin
  return jsonb_build_object('version', (select version from yeti_private.rk_games where id = p_game and room_id = v_room), 'server_time', now());
end $$;
grant execute on function public.yeti_rk_list(text), public.yeti_rk_version(text, bigint) to anon, authenticated;

-- Déclencheurs communs : début de partie, salons en double, résultats
create or replace function yeti_private.drop_other_lobbies()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if old.status = 'lobby' and new.status <> 'lobby' then
    if tg_table_name = 'camel_games' then
      delete from yeti_private.camel_games where room_id = new.room_id and status = 'lobby' and id <> new.id and seats && new.seats;
    elsif tg_table_name = 'rk_games' then
      delete from yeti_private.rk_games where room_id = new.room_id and status = 'lobby' and id <> new.id and seats && new.seats;
    else
      delete from yeti_private.sk_games where room_id = new.room_id and status = 'lobby' and id <> new.id and seats && new.seats;
    end if;
  end if;
  return null;
end $$;

-- Places : vainqueur 1er, puis les éliminés du dernier au premier. Les bots (ids négatifs) ne sont pas enregistrés.
create or replace function yeti_private.record_risk(g yeti_private.rk_games)
returns void language plpgsql security definer set search_path to '' as $$
declare n int := jsonb_array_length(g.state->'players');
begin
  if g.status <> 'done' or g.state->>'phase' <> 'done' then return; end if;
  with e as (select (v)::int seat, k::int k from jsonb_array_elements_text(g.state->'elim') with ordinality x(v, k)),
  pl as (
    select s, (g.state->'players'->>s)::int player,
      case when s = (g.state->>'winner')::int then 1 else 1 + n - coalesce((select k from e where e.seat = s), n) end pos,
      (select count(*) from jsonb_each_text(g.state->'owner') o where o.value::int = s)::int terr
    from generate_series(0, n - 1) s)
  insert into yeti_private.game_results (room_id, kind, game_id, player, pos, n_players, pts, won, finished_at)
  select g.room_id, 'risk', g.id, player, pos, n, terr, pos = 1, coalesce(g.finished_at, g.moved_at, now())
  from pl where player > 0
  on conflict do nothing;
end $$;

create or replace function yeti_private.on_game_finished()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_table_name = 'duels' then
    if new.finished_at is not null and old.finished_at is null then perform yeti_private.record_duel(new); end if;
  elsif tg_table_name = 'camel_games' then
    if new.status = 'done' and old.status <> 'done' then perform yeti_private.record_camel(new); end if;
  elsif tg_table_name = 'rk_games' then
    if new.status = 'done' and old.status <> 'done' then perform yeti_private.record_risk(new); end if;
  elsif new.status = 'done' and old.status <> 'done' then perform yeti_private.record_skull(new);
  end if;
  return null;
exception when others then
  raise warning 'résultat non enregistré : %', sqlerrm; return null;
end $$;

drop trigger if exists rk_started on yeti_private.rk_games;
create trigger rk_started before update on yeti_private.rk_games for each row execute function yeti_private.set_started_at();
drop trigger if exists rk_drop_lobbies on yeti_private.rk_games;
create trigger rk_drop_lobbies after update on yeti_private.rk_games for each row execute function yeti_private.drop_other_lobbies();
drop trigger if exists rk_record_result on yeti_private.rk_games;
create trigger rk_record_result after update on yeti_private.rk_games for each row execute function yeti_private.on_game_finished();

-- Suppression par l'admin et le modo : ajout du Risk
create or replace function public.yeti_admin_delete_game(p_room_code text, p_player integer, p_token text, p_kind text, p_id bigint, p_scope text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); n integer := 0;
begin
  if not yeti_private.session_ok(v_room, p_player, p_token) then raise exception using errcode = '22023', message = 'Reconnecte-toi.'; end if;
  if not exists (select 1 from yeti_private.players where room_id = v_room and id = p_player and (is_admin or is_mod)) then
    raise exception using errcode = '22023', message = 'Réservé à Thibaud et Alexandre.'; end if;
  if p_scope not in ('one', 'done', 'all') or p_kind not in ('duel', 'camel', 'skull', 'risk') then raise exception using errcode = '22023', message = 'Suppression inconnue.'; end if;
  if p_kind = 'duel' then
    delete from yeti_private.duels d where d.room_id = v_room and (
      (p_scope = 'one' and d.id = p_id) or p_scope = 'all'
      or (p_scope = 'done' and (d.status = 'refused' or d.finished_at is not null or (d.game = 'yeti' and d.status = 'accepted' and d.c_n >= d.throws and d.o_n >= d.throws))));
  elsif p_kind = 'camel' then
    delete from yeti_private.camel_games g where g.room_id = v_room and ((p_scope = 'one' and g.id = p_id) or p_scope = 'all' or (p_scope = 'done' and g.status = 'done'));
  elsif p_kind = 'risk' then
    delete from yeti_private.rk_games g where g.room_id = v_room and ((p_scope = 'one' and g.id = p_id) or p_scope = 'all' or (p_scope = 'done' and g.status = 'done'));
  else
    delete from yeti_private.sk_games g where g.room_id = v_room and ((p_scope = 'one' and g.id = p_id) or p_scope = 'all' or (p_scope = 'done' and g.status = 'done'));
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'deleted', n);
end $$;

-- Les notifs de jeu passent par les rappels de tour (pas d'envoi direct)
create or replace function yeti_private.push(p_room uuid, p_players integer[], p_title text, p_body text, p_url text, p_tag text)
returns void language plpgsql security definer set search_path to '' as $$
declare v integer[]; t text := coalesce(p_tag, '');
begin
  if t ~ '^(game|duel|camel|skull|risk)-' then return; end if;
  select array_agg(distinct x) into v from unnest(p_players) x
    where t = 'test' or not exists (select 1 from yeti_private.push_log l where l.room_id = p_room and l.player = x and l.tag = t and l.at > now() - interval '1 minute');
  if v is null then return; end if;
  insert into yeti_private.push_log (room_id, player, tag) select p_room, x, t from unnest(v) x;
  perform yeti_private.push_send(p_room, v, p_title, p_body, p_url, p_tag);
end $$;

-- Rappels de tour : invitations, mise en place, tour de jeu, et alerte aux admins quand un joueur traîne depuis 2 min
do $do$
declare d text;
begin
  d := pg_get_functiondef('yeti_private.turn_todo()'::regprocedure);
  if position('rk_games' in d) > 0 then return; end if;
  d := regexp_replace(d, '\$function\$\s*$', $add$
  union all
  select 'risk', g.id, g.room_id, g.seats[i]::int, 'invite', g.created_at,
    '🎲 ' || yeti_private.pname(g.room_id, g.host) || ' t’invite au Risk', 'Rejoins la partie dans Compétitions › Risk.', '?open=risk&id=' || g.id
  from yeti_private.rk_games g cross join lateral generate_subscripts(g.seats, 1) i
  where g.status = 'lobby' and g.seat_state[i] = 'invited'
  union all
  select 'risk', g.id, g.room_id, (g.state->'players'->>(b.i::int - 1))::int, 'setup', g.started_at,
    '🎲 Risk : place tes armées', 'La partie commence, place tes armées de départ.', '?open=risk&id=' || g.id
  from yeti_private.rk_games g cross join lateral jsonb_array_elements(g.state->'setupDone') with ordinality b(v, i)
  where g.status = 'playing' and g.state->>'phase' = 'setup' and b.v = 'false'::jsonb and (g.state->'players'->>(b.i::int - 1))::int > 0
  union all
  select 'risk', g.id, g.room_id, (g.state->'players'->>((g.state->>'turn')::int))::int, 'r' || (g.state->>'round') || '-' || (g.state->>'turn'), g.moved_at,
    '🎲 Risk : à toi de jouer !', 'Tes troupes attendent tes ordres.', '?open=risk&id=' || g.id
  from yeti_private.rk_games g
  where g.status = 'playing' and g.state->>'phase' not in ('setup', 'done') and jsonb_typeof(g.state->'turn') = 'number'
    and (g.state->'players'->>((g.state->>'turn')::int))::int > 0
  union all
  select 'risk', g.id, g.room_id, a.id::int, 'adm-r' || (g.state->>'round') || '-' || (g.state->>'turn'), g.moved_at + interval '1 minute',
    '🎲 Risk : ' || yeti_private.pname(g.room_id, (g.state->'players'->>((g.state->>'turn')::int))::int) || ' ne joue pas',
    'Ça fait 2 min. Tu peux le faire jouer en auto ou le remplacer par un bot.', '?open=risk&id=' || g.id
  from yeti_private.rk_games g join yeti_private.players a on a.room_id = g.room_id and (a.is_admin or a.is_mod)
  where g.status = 'playing' and g.state->>'phase' not in ('setup', 'done') and jsonb_typeof(g.state->'turn') = 'number'
    and (g.state->'players'->>((g.state->>'turn')::int))::int > 0 and (g.state->'players'->>((g.state->>'turn')::int))::int <> a.id
$function$
$add$);
  execute d;
end $do$;

-- Partage du monde (1re armée posée à la main) : un rappel par choix, et texte dédié
do $do$
declare d text;
begin
  d := pg_get_functiondef('yeti_private.turn_todo()'::regprocedure);
  if position('''c'' || g.version' in d) > 0 then return; end if;
  d := replace(d, $a$'r' || (g.state->>'round') || '-' || (g.state->>'turn'), g.moved_at,
    '🎲 Risk : à toi de jouer !', 'Tes troupes attendent tes ordres.'$a$,
    $b$case when g.state->>'phase' = 'claim' then 'c' || g.version else 'r' || (g.state->>'round') || '-' || (g.state->>'turn') end, g.moved_at,
    case when g.state->>'phase' = 'claim' then '🎲 Risk : choisis un territoire !' else '🎲 Risk : à toi de jouer !' end,
    case when g.state->>'phase' = 'claim' then 'Pose ta 1re armée sur un territoire libre.' else 'Tes troupes attendent tes ordres.' end$b$);
  d := replace(d, $a$'adm-r' || (g.state->>'round') || '-' || (g.state->>'turn')$a$,
    $b$'adm-' || case when g.state->>'phase' = 'claim' then 'c' || g.version else 'r' || (g.state->>'round') || '-' || (g.state->>'turn') end$b$);
  if position('''c'' || g.version' in d) = 0 then raise exception 'remplacement raté'; end if;
  execute d;
end $do$;
