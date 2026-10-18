-- Défis 1v1 en échecs et bataille navale + tags de groupe (@lesarabes, @lesblancs, @here).
-- Les parties vivent dans yeti_private.duels (game = 'chess' | 'naval'), l'état dans gstate.
-- Bataille navale : les flottes restent côté serveur, chaque tir est résolu ici (pas de triche possible).

alter table yeti_private.duels
  add column if not exists game text not null default 'yeti',
  add column if not exists gstate jsonb,
  add column if not exists ply integer not null default 0,
  add column if not exists winner smallint,
  add column if not exists finished_at timestamptz,
  add column if not exists moved_at timestamptz;
do $$ begin
  alter table yeti_private.duels add constraint duels_game_chk check (game in ('yeti','chess','naval'));
exception when duplicate_object then null; end $$;

create table if not exists yeti_private.mention_groups (
  room_id uuid not null references yeti_private.rooms(id),
  tag text not null,
  members smallint[] not null,
  primary key (room_id, tag)
);
alter table yeti_private.mention_groups enable row level security;
revoke all on yeti_private.mention_groups from public, anon, authenticated;
insert into yeti_private.mention_groups (room_id, tag, members)
select r.id, g.tag, array(select p.id from yeti_private.players p where p.room_id = r.id and p.name = any(g.names))
from yeti_private.rooms r,
  (values ('lesarabes', array['Imany','Mouna','Malak']), ('lesblancs', array['Thibaud','Alexandre','Loïc','Nina'])) g(tag, names)
where exists (select 1 from yeti_private.players p where p.room_id = r.id and p.name = 'Imany')
on conflict (room_id, tag) do update set members = excluded.members;

-- Joueurs visés par un message : @prénom, @tous, @here (connectés), @groupe.
create or replace function yeti_private.mention_targets(p_room uuid, p_sender integer, p_body text) returns integer[]
language sql stable security definer set search_path to '' as $f$
  with w as (select '(^|[^[:alnum:]_])@' as pre, '($|[^[:alnum:]_])' as post)
  select array_agg(distinct p.id::integer) from yeti_private.players p, w
  where p.room_id = p_room and p.id <> p_sender and (
    p_body ~* (w.pre || '(tous|all|everyone)' || w.post)
    or p_body ~* (w.pre || regexp_replace(p.name, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || w.post)
    or (p_body ~* (w.pre || 'here' || w.post) and exists (select 1 from yeti_private.presence s
          where s.room_id = p_room and s.player = p.id and s.last_seen > now() - interval '30 seconds'))
    or exists (select 1 from yeti_private.mention_groups g where g.room_id = p_room and p.id = any(g.members)
          and p_body ~* (w.pre || g.tag || w.post)));
$f$;
revoke all on function yeti_private.mention_targets(uuid, integer, text) from public, anon, authenticated;

create or replace function public.yeti_send_message(p_room_code text, p_player integer, p_body text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code); v_body text := btrim(regexp_replace(coalesce(p_body,''),'\s+',' ','g')); v_id bigint; v_ban timestamptz;
  v_name text; v_targets integer[]; v_text text;
begin
  select banned_until, name into v_ban, v_name from yeti_private.players where room_id = v_room and id = p_player;
  if not found then raise exception using errcode='22023', message='Joueur incorrect'; end if;
  if v_ban > now() then raise exception using errcode='22023', message=yeti_private.ban_message(v_ban); end if;
  if char_length(v_body) not between 1 and 280 then raise exception using errcode='22023', message='Message vide ou trop long'; end if;
  if exists (select 1 from yeti_private.messages where room_id = v_room and player = p_player and created_at > now() - interval '1 second') then
    raise exception using errcode='22023', message='Doucement, un message par seconde';
  end if;
  insert into yeti_private.messages (room_id, player, body) values (v_room, p_player, v_body) returning id into v_id;
  if position('@' in v_body) > 0 then
    v_targets := yeti_private.mention_targets(v_room, p_player, v_body);
    if v_targets is not null then
      v_text := case when v_body ~ '^\[g:' then 'a envoyé un GIF' when v_body ~ '^\[s:' then substring(v_body from 4 for char_length(v_body) - 4) else left(v_body, 140) end;
      perform yeti_private.push(v_room, v_targets, '💬 ' || v_name || ' t’a tagué', v_text, '?open=chat', 'chat');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

-- ---------- Parties d'échecs / bataille navale ----------
create or replace function yeti_private.game_label(p_game text) returns text language sql immutable set search_path to '' as $f$
  select case p_game when 'chess' then 'aux échecs' when 'naval' then 'à la bataille navale' else 'en duel' end;
$f$;

create or replace function public.yeti_create_game(p_room_code text, p_player integer, p_token text, p_opponent integer, p_game text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code); v_id bigint; v_state jsonb; v_name text;
begin
  if not yeti_private.session_ok(v_room, p_player, p_token) then raise exception using errcode='22023', message='Reconnecte-toi pour lancer un défi.'; end if;
  if p_game not in ('chess','naval') then raise exception using errcode='22023', message='Jeu inconnu.'; end if;
  if p_player = p_opponent or (select count(*) from yeti_private.players where room_id = v_room and id in (p_player, p_opponent)) <> 2 then
    raise exception using errcode='22023', message='Duel impossible'; end if;
  if exists (select 1 from yeti_private.players where room_id = v_room and id = p_opponent and banned_until > now()) then
    raise exception using errcode='22023', message='Ce joueur est banni.'; end if;
  if (select count(*) from yeti_private.duels where room_id = v_room and challenger = p_player and created_at > now() - interval '1 day') >= 15 then
    raise exception using errcode='22023', message='Trop de défis lancés aujourd’hui'; end if;
  v_state := case p_game
    when 'chess' then jsonb_build_object('white', case when random() < 0.5 then p_player else p_opponent end,
                       'fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'moves', '[]'::jsonb)
    else jsonb_build_object('phase', 'place', 'fleets', '{}'::jsonb, 'shots', jsonb_build_object(p_player::text, '[]'::jsonb, p_opponent::text, '[]'::jsonb), 'turn', p_player) end;
  insert into yeti_private.duels (room_id, challenger, opponent, game, gstate, throws)
    values (v_room, p_player, p_opponent, p_game, v_state, 0) returning id into v_id;
  select name into v_name from yeti_private.players where room_id = v_room and id = p_player;
  perform yeti_private.push(v_room, array[p_opponent], '⚔️ ' || v_name || ' te défie ' || yeti_private.game_label(p_game), 'Accepte ou refuse le défi dans Duels 1v1.', '?open=duel', 'duel-' || v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

-- Bataille navale : flotte = 5 bateaux (5,4,3,3,2), cases 0..99 (ligne*10+colonne), en ligne droite, sans chevauchement.
create or replace function yeti_private.naval_fleet_ok(p_fleet jsonb) returns boolean
language plpgsql immutable set search_path to '' as $f$
declare v_sizes int[] := '{}'; v_all int[] := '{}'; v_ship jsonb; v_cells int[]; v_i int; v_row boolean; v_col boolean;
begin
  if jsonb_typeof(p_fleet) <> 'array' or jsonb_array_length(p_fleet) <> 5 then return false; end if;
  for v_ship in select * from jsonb_array_elements(p_fleet) loop
    if jsonb_typeof(v_ship) <> 'array' then return false; end if;
    select array_agg(x::int order by x::int) into v_cells from jsonb_array_elements_text(v_ship) x;
    if v_cells is null or exists (select 1 from unnest(v_cells) c where c < 0 or c > 99) then return false; end if;
    v_row := true; v_col := true;
    for v_i in 2..cardinality(v_cells) loop
      if not (v_cells[v_i] = v_cells[v_i-1] + 1 and v_cells[v_i] / 10 = v_cells[1] / 10) then v_row := false; end if;
      if not (v_cells[v_i] = v_cells[v_i-1] + 10) then v_col := false; end if;
    end loop;
    if not (v_row or v_col) then return false; end if;
    v_sizes := v_sizes || cardinality(v_cells); v_all := v_all || v_cells;
  end loop;
  if (select array_agg(s order by s desc) from unnest(v_sizes) s) <> array[5,4,3,3,2] then return false; end if;
  return (select count(distinct c) from unnest(v_all) c) = 17;
end $f$;

-- Vue d'une partie : pour la bataille navale, on ne voit que sa propre flotte (et les bateaux coulés de l'autre).
create or replace function yeti_private.game_view(p_d yeti_private.duels, p_viewer integer) returns jsonb
language plpgsql stable set search_path to '' as $f$
declare v_s jsonb := p_d.gstate; v_me text := p_viewer::text; v_other text; v_fleet jsonb; v_sunk jsonb := '[]'::jsonb; v_ship jsonb; v_shots jsonb;
begin
  if p_d.game = 'chess' or v_s is null then return v_s; end if;
  v_other := case when p_viewer = p_d.challenger then p_d.opponent::text when p_viewer = p_d.opponent then p_d.challenger::text end;
  if v_other is null then -- spectateur
    return jsonb_build_object('phase', v_s->'phase', 'turn', v_s->'turn', 'shots', v_s->'shots',
      'placed', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(v_s->'fleets') k));
  end if;
  -- bateaux adverses coulés (ou toute la flotte en fin de partie)
  v_fleet := v_s->'fleets'->v_other; v_shots := coalesce(v_s->'shots'->v_me, '[]'::jsonb);
  if v_fleet is not null then
    for v_ship in select * from jsonb_array_elements(v_fleet) loop
      if p_d.finished_at is not null or not exists (select 1 from jsonb_array_elements_text(v_ship) c
           where not exists (select 1 from jsonb_array_elements(v_shots) s where (s->>'c') = c)) then
        v_sunk := v_sunk || jsonb_build_array(v_ship);
      end if;
    end loop;
  end if;
  return jsonb_build_object('phase', v_s->'phase', 'turn', v_s->'turn', 'shots', v_s->'shots',
    'mine', v_s->'fleets'->v_me, 'sunk', v_sunk,
    'placed', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(v_s->'fleets') k));
end $f$;

create or replace function public.yeti_game_state(p_room_code text, p_player integer, p_token text, p_duel bigint)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code); v_d yeti_private.duels%rowtype; v_viewer integer := 0;
begin
  select * into v_d from yeti_private.duels where room_id = v_room and id = p_duel and game <> 'yeti';
  if not found then raise exception using errcode='22023', message='Partie introuvable.'; end if;
  if p_player is not null and yeti_private.session_ok(v_room, p_player, p_token) then v_viewer := p_player; end if;
  return jsonb_build_object('id', v_d.id, 'game', v_d.game, 'challenger', v_d.challenger, 'opponent', v_d.opponent, 'status', v_d.status,
    'ply', v_d.ply, 'winner', v_d.winner, 'finished_at', v_d.finished_at, 'moved_at', coalesce(v_d.moved_at, v_d.answered_at),
    'viewer', v_viewer, 'state', yeti_private.game_view(v_d, v_viewer), 'server_time', now());
end $function$;

-- Un coup / une action. p_ply = numéro du coup attendu (évite les doubles envois).
-- Échecs : {"san","from","to","promotion","fen","end":"checkmate|draw"} · {"resign":true} · {"draw":"offer|accept|decline"} · {"claim":true}
-- Navale : {"fleet":[[..],..]} · {"shot":n} · {"resign":true} · {"claim":true}
create or replace function public.yeti_game_move(p_room_code text, p_player integer, p_token text, p_duel bigint, p_ply integer, p_move jsonb)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code); v_d yeti_private.duels%rowtype; v_s jsonb; v_other integer; v_turn integer;
  v_cell int; v_fleet jsonb; v_hit boolean := false; v_sunk boolean := false; v_win boolean := false; v_ship jsonb; v_shots jsonb;
  v_name text; v_notify boolean := false; v_end text;
begin
  if not yeti_private.session_ok(v_room, p_player, p_token) then raise exception using errcode='22023', message='Reconnecte-toi pour jouer.'; end if;
  select * into v_d from yeti_private.duels where room_id = v_room and id = p_duel and game <> 'yeti' for update;
  if not found then raise exception using errcode='22023', message='Partie introuvable.'; end if;
  if p_player not in (v_d.challenger, v_d.opponent) then raise exception using errcode='22023', message='Ce n’est pas ta partie.'; end if;
  if v_d.status <> 'accepted' then raise exception using errcode='22023', message='Le défi n’a pas encore été accepté.'; end if;
  if v_d.finished_at is not null then raise exception using errcode='22023', message='La partie est terminée.'; end if;
  v_other := case when p_player = v_d.challenger then v_d.opponent else v_d.challenger end;
  v_s := v_d.gstate;
  if v_d.game = 'chess' then
    v_turn := case when v_d.ply % 2 = 0 then (v_s->>'white')::int else (case when (v_s->>'white')::int = v_d.challenger then v_d.opponent else v_d.challenger end) end;
  else
    v_turn := (v_s->>'turn')::int;
  end if;

  if p_move ? 'resign' then
    update yeti_private.duels set winner = v_other, finished_at = now(), moved_at = now(), ply = ply + 1,
      gstate = gstate || jsonb_build_object('end', 'resign') where id = v_d.id;
    v_notify := true; v_end := 'a abandonné';
  elsif p_move ? 'claim' then
    if not (case when v_d.game = 'naval' and v_s->>'phase' = 'place'
                 then (v_s->'fleets') ? p_player::text and not ((v_s->'fleets') ? v_other::text)
                 else v_turn = v_other end) then
      raise exception using errcode='22023', message='Ce n’est pas à ton adversaire de jouer.';
    end if;
    if coalesce(v_d.moved_at, v_d.answered_at) > now() - interval '24 hours' then
      raise exception using errcode='22023', message='Ton adversaire a 24 h pour jouer avant que tu puisses réclamer la victoire.';
    end if;
    update yeti_private.duels set winner = p_player, finished_at = now(), moved_at = now(), ply = ply + 1,
      gstate = gstate || jsonb_build_object('end', 'timeout') where id = v_d.id;
    v_notify := true; v_end := 'a gagné par forfait (24 h sans jouer)';
  elsif v_d.game = 'chess' and p_move ? 'draw' then
    if p_move->>'draw' = 'offer' then
      update yeti_private.duels set gstate = gstate || jsonb_build_object('draw_offer', p_player) where id = v_d.id;
      v_notify := true; v_end := 'te propose la nulle';
    elsif p_move->>'draw' = 'accept' and (v_s->>'draw_offer')::int = v_other then
      update yeti_private.duels set winner = 0, finished_at = now(), moved_at = now(), ply = ply + 1,
        gstate = (gstate - 'draw_offer') || jsonb_build_object('end', 'agreed') where id = v_d.id;
      v_notify := true; v_end := 'a accepté la nulle';
    else
      update yeti_private.duels set gstate = gstate - 'draw_offer' where id = v_d.id;
    end if;
  elsif v_d.game = 'chess' then
    if p_ply <> v_d.ply then raise exception using errcode='22023', message='La partie a bougé, on recharge.'; end if;
    if v_turn <> p_player then raise exception using errcode='22023', message='Ce n’est pas ton tour.'; end if;
    if coalesce(p_move->>'san','') !~ '^[A-Za-z0-9+#=\-]{2,8}$' or coalesce(p_move->>'fen','') !~ '^[pnbrqkPNBRQK1-8/]+ [wb] [KQkq-]{1,4} [a-h1-8-]{1,2} \d+ \d+$' then
      raise exception using errcode='22023', message='Coup illisible.'; end if;
    v_s := (v_s - 'draw_offer') || jsonb_build_object('fen', p_move->>'fen',
      'moves', (v_s->'moves') || jsonb_build_array(jsonb_build_object('san', p_move->>'san', 'from', p_move->>'from', 'to', p_move->>'to')));
    if p_move->>'end' = 'checkmate' then
      update yeti_private.duels set gstate = v_s || '{"end":"checkmate"}', ply = ply + 1, moved_at = now(), winner = p_player, finished_at = now() where id = v_d.id;
      v_end := 'te met échec et mat';
    elsif p_move->>'end' in ('stalemate','draw') then
      update yeti_private.duels set gstate = v_s || jsonb_build_object('end', p_move->>'end'), ply = ply + 1, moved_at = now(), winner = 0, finished_at = now() where id = v_d.id;
      v_end := 'a joué ' || (p_move->>'san') || ' : partie nulle';
    else
      update yeti_private.duels set gstate = v_s, ply = ply + 1, moved_at = now() where id = v_d.id;
      v_end := 'a joué ' || (p_move->>'san') || ', à toi !';
    end if;
    v_notify := true;
  else -- bataille navale
    if p_move ? 'fleet' then
      if v_s->>'phase' <> 'place' or v_s->'fleets' ? p_player::text then raise exception using errcode='22023', message='Ta flotte est déjà placée.'; end if;
      if not yeti_private.naval_fleet_ok(p_move->'fleet') then raise exception using errcode='22023', message='Flotte invalide : 5 bateaux (5, 4, 3, 3, 2) en ligne droite, sans se chevaucher.'; end if;
      v_s := jsonb_set(v_s, array['fleets', p_player::text], p_move->'fleet');
      if v_s->'fleets' ? v_other::text then
        v_s := v_s || jsonb_build_object('phase', 'play', 'turn', v_d.challenger); v_notify := true; v_end := 'a placé sa flotte : la bataille commence !';
      end if;
      update yeti_private.duels set gstate = v_s, ply = ply + 1, moved_at = now() where id = v_d.id;
    elsif p_move ? 'shot' then
      if v_s->>'phase' <> 'play' then raise exception using errcode='22023', message='Les flottes ne sont pas encore placées.'; end if;
      if v_turn <> p_player then raise exception using errcode='22023', message='Ce n’est pas ton tour.'; end if;
      if p_ply <> v_d.ply then raise exception using errcode='22023', message='La partie a bougé, on recharge.'; end if;
      v_cell := (p_move->>'shot')::int;
      if v_cell is null or v_cell < 0 or v_cell > 99 then raise exception using errcode='22023', message='Case invalide.'; end if;
      v_shots := coalesce(v_s->'shots'->p_player::text, '[]'::jsonb);
      if exists (select 1 from jsonb_array_elements(v_shots) s where (s->>'c')::int = v_cell) then raise exception using errcode='22023', message='Tu as déjà tiré ici.'; end if;
      v_fleet := v_s->'fleets'->v_other::text;
      for v_ship in select * from jsonb_array_elements(v_fleet) loop
        if v_ship @> to_jsonb(v_cell) then
          v_hit := true;
          v_sunk := not exists (select 1 from jsonb_array_elements_text(v_ship) c where c::int <> v_cell
                     and not exists (select 1 from jsonb_array_elements(v_shots) s where (s->>'c')::int = c::int));
        end if;
      end loop;
      v_shots := v_shots || jsonb_build_array(jsonb_build_object('c', v_cell, 'h', v_hit, 's', v_sunk));
      v_win := v_hit and (select count(*) from jsonb_array_elements(v_shots) s where (s->>'h')::boolean) >= 17;
      v_s := jsonb_set(v_s, array['shots', p_player::text], v_shots) || jsonb_build_object('turn', case when v_hit and not v_win then p_player else v_other end);
      if v_win then
        update yeti_private.duels set gstate = v_s || '{"end":"sunk"}', ply = ply + 1, moved_at = now(), winner = p_player, finished_at = now() where id = v_d.id;
        v_notify := true; v_end := 'a coulé toute ta flotte 💀';
      else
        update yeti_private.duels set gstate = v_s, ply = ply + 1, moved_at = now() where id = v_d.id;
        if not v_hit then v_notify := true; v_end := 'a raté son tir, à toi !'; end if;
      end if;
    else
      raise exception using errcode='22023', message='Action inconnue.';
    end if;
  end if;

  -- notification à l'adversaire seulement s'il n'est pas sur le site
  if v_notify and not exists (select 1 from yeti_private.presence where room_id = v_room and player = v_other and last_seen > now() - interval '30 seconds') then
    select name into v_name from yeti_private.players where room_id = v_room and id = p_player;
    perform yeti_private.push(v_room, array[v_other], (case when v_d.game = 'chess' then '♟️ ' else '🚢 ' end) || v_name || ' ' || v_end,
      'Touche pour ouvrir la partie.', '?open=game&id=' || v_d.id, 'game-' || v_d.id);
  end if;
  return jsonb_build_object('ok', true, 'hit', v_hit, 'sunk', v_sunk, 'win', v_win);
end $function$;

revoke all on function public.yeti_create_game(text, integer, text, integer, text), public.yeti_game_state(text, integer, text, bigint),
  public.yeti_game_move(text, integer, text, bigint, integer, jsonb) from public;
grant execute on function public.yeti_create_game(text, integer, text, integer, text), public.yeti_game_state(text, integer, text, bigint),
  public.yeti_game_move(text, integer, text, bigint, integer, jsonb) to anon, authenticated;
revoke all on function yeti_private.naval_fleet_ok(jsonb), yeti_private.game_view(yeti_private.duels, integer), yeti_private.game_label(text) from public, anon, authenticated;

-- yeti_get_state : le type de jeu et le résultat de chaque partie, + les groupes de tags.
create or replace function public.yeti_get_state(p_room_code text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid; v_scores jsonb; v_players jsonb; v_duels jsonb; v_daily jsonb; v_groups jsonb;
begin
  v_room := yeti_private.room_of(p_room_code);
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'player',player,'played_at',played_at,'score',score,'mode',mode,'ref',ref)) order by played_at, id), '[]'::jsonb)
    into v_scores from yeti_private.scores where room_id = v_room and not is_test;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'skins',skins,'total',total_throws,
      'locked', pin_hash is not null, 'admin', is_admin, 'banned_until', case when banned_until > now() then banned_until end) order by id), '[]'::jsonb)
    into v_players from yeti_private.players where room_id = v_room;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'challenger',challenger,'opponent',opponent,'throws',throws,'status',status,'created_at',created_at,
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

-- yeti_get_version : bouge aussi quand un coup est joué.
create or replace function public.yeti_get_version(p_room_code text)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_room uuid;
begin
  if p_room_code is null or length(p_room_code) not between 4 and 128 then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(p_room_code,'UTF8'));
  if v_room is null then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  return jsonb_build_object(
    'version',
      (select count(*)||'-'||coalesce(extract(epoch from max(received_at))::text,'0') from yeti_private.scores where room_id = v_room and not is_test)
      ||'/'||(select count(*)||'-'||coalesce(max(id),0)||'-'||coalesce(sum(cardinality(skins)),0) from yeti_private.players where room_id = v_room)
      ||'/'||(select coalesce(max(id),0)||'-'||coalesce(extract(epoch from max(answered_at))::text,'0')||'-'||coalesce(sum(ply),0) from yeti_private.duels where room_id = v_room),
    'chat', (select coalesce(max(id),0) from yeti_private.messages where room_id = v_room));
end $function$;
