-- Échecs : bouton « Annuler la partie » avant le 2e coup ({"abort":true}) et pas de doublon de défi en attente.

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
  -- déjà un défi en attente entre ces deux joueurs pour ce jeu : on le réutilise (évite les doublons)
  select id into v_id from yeti_private.duels where room_id = v_room and game = p_game and status = 'pending'
    and challenger = p_player and opponent = p_opponent order by id desc limit 1;
  if v_id is not null then return jsonb_build_object('ok', true, 'id', v_id, 'existing', true); end if;
  if (select count(*) from yeti_private.duels where room_id = v_room and challenger = p_player and created_at > now() - interval '1 day') >= 15 then
    raise exception using errcode='22023', message='Trop de défis lancés aujourd’hui'; end if;
  v_state := case p_game
    when 'chess' then jsonb_build_object('white', case when random() < 0.5 then p_player else p_opponent end,
                       'fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'moves', '[]'::jsonb,
                       'clock', jsonb_build_object('w', 600000, 'b', 600000), 'ts', null)
    else jsonb_build_object('phase', 'place', 'fleets', '{}'::jsonb, 'shots', jsonb_build_object(p_player::text, '[]'::jsonb, p_opponent::text, '[]'::jsonb), 'turn', p_player) end;
  insert into yeti_private.duels (room_id, challenger, opponent, game, gstate, throws)
    values (v_room, p_player, p_opponent, p_game, v_state, 0) returning id into v_id;
  select name into v_name from yeti_private.players where room_id = v_room and id = p_player;
  perform yeti_private.push(v_room, array[p_opponent], '⚔️ ' || v_name || ' te défie ' || yeti_private.game_label(p_game), 'Accepte ou refuse le défi dans Duels 1v1.', '?open=duel', 'duel-' || v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

-- yeti_game_move : identique à 2026-10-19_echecs_pendule.sql, avec ce bloc ajouté juste avant « if p_move ? 'resign' » (qui devient « elsif ») :
--
--   if p_move ? 'abort' then
--     if v_d.game <> 'chess' or v_d.ply >= 2 then raise exception using errcode='22023', message='Trop tard pour annuler : tu peux abandonner.'; end if;
--     update yeti_private.duels set winner = 0, finished_at = now(), moved_at = now(), ply = ply + 1,
--       gstate = gstate || jsonb_build_object('end', 'aborted') where id = v_d.id;
--     v_notify := true; v_end := 'a annulé la partie';
--   elsif p_move ? 'resign' then

-- Heure de début de la partie (started_at = acceptation du défi).
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
    'created_at', v_d.created_at, 'started_at', v_d.answered_at,
    'viewer', v_viewer, 'state', yeti_private.game_view(v_d, v_viewer), 'server_time', now(), 'server_ms', floor(extract(epoch from clock_timestamp()) * 1000));
end $function$;
