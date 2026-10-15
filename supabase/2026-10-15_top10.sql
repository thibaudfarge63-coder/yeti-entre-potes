-- Historique allégé : on ne garde que les 10 meilleurs lancers de chaque joueur (tous modes confondus)
-- + tous les lancers de Battle royale et de duels. Le nombre de lancers à vie reste dans players.total_throws.
-- Appelée à chaque enregistrement de lancers. Déjà appliqué sur le projet bmqkhumtkdtrdxsjjubt.
create or replace function yeti_private.prune_scores(p_room uuid) returns integer
language plpgsql security definer set search_path to '' as $$
declare v_n integer;
begin
  delete from yeti_private.scores s
  where s.room_id = p_room
    and s.mode is null
    and s.id not in (
      select id from (
        select id, row_number() over (partition by player order by score desc, played_at, id) rn
        from yeti_private.scores where room_id = p_room
      ) t where rn <= 10);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function yeti_private.prune_scores(uuid) from public, anon, authenticated;
