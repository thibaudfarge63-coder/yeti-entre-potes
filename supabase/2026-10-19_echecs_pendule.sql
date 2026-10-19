-- Échecs : pendule de 10 minutes par joueur (gstate.clock = ms restants, gstate.ts = heure du dernier coup en ms).
-- La pendule démarre au 1er coup des blancs. {"flag":true} constate qu'une pendule est tombée.

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
                       'fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'moves', '[]'::jsonb,
                       'clock', jsonb_build_object('w', 600000, 'b', 600000), 'ts', null)
    else jsonb_build_object('phase', 'place', 'fleets', '{}'::jsonb, 'shots', jsonb_build_object(p_player::text, '[]'::jsonb, p_opponent::text, '[]'::jsonb), 'turn', p_player) end;
  insert into yeti_private.duels (room_id, challenger, opponent, game, gstate, throws)
    values (v_room, p_player, p_opponent, p_game, v_state, 0) returning id into v_id;
  select name into v_name from yeti_private.players where room_id = v_room and id = p_player;
  perform yeti_private.push(v_room, array[p_opponent], '⚔️ ' || v_name || ' te défie ' || yeti_private.game_label(p_game), 'Accepte ou refuse le défi dans Duels 1v1.', '?open=duel', 'duel-' || v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

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
    'viewer', v_viewer, 'state', yeti_private.game_view(v_d, v_viewer), 'server_time', now(), 'server_ms', floor(extract(epoch from clock_timestamp()) * 1000));
end $function$;

create or replace function public.yeti_game_move(p_room_code text, p_player integer, p_token text, p_duel bigint, p_ply integer, p_move jsonb)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code); v_d yeti_private.duels%rowtype; v_s jsonb; v_other integer; v_turn integer;
  v_cell int; v_fleet jsonb; v_hit boolean := false; v_sunk boolean := false; v_win boolean := false; v_ship jsonb; v_shots jsonb;
  v_name text; v_notify boolean := false; v_end text;
  v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000); v_col text; v_left bigint;
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

  -- Pendule (10 min chacun) : elle tourne à partir du 1er coup des blancs.
  if v_d.game = 'chess' and v_s ? 'clock' and v_d.ply >= 1 then
    v_col := case when v_d.ply % 2 = 0 then 'w' else 'b' end;
    v_left := (v_s->'clock'->>v_col)::bigint - (v_now - (v_s->>'ts')::bigint);
    if v_left <= 0 then
      update yeti_private.duels set winner = case when v_turn = v_d.challenger then v_d.opponent else v_d.challenger end,
        finished_at = now(), moved_at = now(), ply = ply + 1,
        gstate = jsonb_set(gstate, array['clock', v_col], '0'::jsonb) || jsonb_build_object('end', 'time') where id = v_d.id;
      v_other := case when p_player = v_d.challenger then v_d.opponent else v_d.challenger end;
      if not exists (select 1 from yeti_private.presence where room_id = v_room and player = v_turn and last_seen > now() - interval '30 seconds') then
        perform yeti_private.push(v_room, array[v_turn], '⏰ Temps écoulé aux échecs', 'Ta pendule est tombée à 0, tu as perdu la partie.', '?open=game&id=' || v_d.id, 'game-' || v_d.id);
      end if;
      return jsonb_build_object('ok', true, 'flagged', true);
    end if;
  end if;
  if p_move ? 'flag' then
    return jsonb_build_object('ok', true, 'flagged', false);
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
    if v_s ? 'clock' then
      if v_d.ply >= 1 then v_s := jsonb_set(v_s, array['clock', case when v_d.ply % 2 = 0 then 'w' else 'b' end], to_jsonb(v_left)); end if;
      v_s := v_s || jsonb_build_object('ts', v_now);
    end if;
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
