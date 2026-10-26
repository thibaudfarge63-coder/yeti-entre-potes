-- 26 oct. 2026 : Thibaud (admin) et Alexandre (modo) peuvent supprimer des parties des listes.
-- p_kind : duel | camel | skull ; p_scope : one (la partie p_id) | done (toutes les terminées/refusées de ce jeu) | all (tout ce jeu).
create or replace function public.yeti_admin_delete_game(p_room_code text, p_player integer, p_token text, p_kind text, p_id bigint, p_scope text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); n integer := 0;
begin
  if not yeti_private.session_ok(v_room, p_player, p_token) then raise exception using errcode = '22023', message = 'Reconnecte-toi.'; end if;
  if not exists (select 1 from yeti_private.players where room_id = v_room and id = p_player and (is_admin or is_mod)) then
    raise exception using errcode = '22023', message = 'Réservé à Thibaud et Alexandre.'; end if;
  if p_scope not in ('one', 'done', 'all') or p_kind not in ('duel', 'camel', 'skull') then raise exception using errcode = '22023', message = 'Suppression inconnue.'; end if;
  if p_kind = 'duel' then
    delete from yeti_private.duels d where d.room_id = v_room and (
      (p_scope = 'one' and d.id = p_id) or p_scope = 'all'
      or (p_scope = 'done' and (d.status = 'refused' or d.finished_at is not null or (d.game = 'yeti' and d.status = 'accepted' and d.c_n >= d.throws and d.o_n >= d.throws))));
  elsif p_kind = 'camel' then
    delete from yeti_private.camel_games g where g.room_id = v_room and ((p_scope = 'one' and g.id = p_id) or p_scope = 'all' or (p_scope = 'done' and g.status = 'done'));
  else
    delete from yeti_private.sk_games g where g.room_id = v_room and ((p_scope = 'one' and g.id = p_id) or p_scope = 'all' or (p_scope = 'done' and g.status = 'done'));
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'deleted', n);
end $$;
revoke all on function public.yeti_admin_delete_game(text, integer, text, text, bigint, text) from public;
grant execute on function public.yeti_admin_delete_game(text, integer, text, text, bigint, text) to anon, authenticated;
