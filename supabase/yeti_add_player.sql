-- Ajout de joueurs depuis le site ("Add user").
-- À exécuter dans le SQL Editor du projet Supabase du club (bmqkhumtkdtrdxsjjubt).
--
-- ⚠️ Le schéma exact de yeti_private n'est pas dans ce dépôt : les noms de tables
-- et de colonnes ci-dessous sont des HYPOTHÈSES. Lance d'abord l'étape 0 et
-- adapte l'étape 1 si les noms diffèrent.

-- 0) Diagnostic : voir comment sont stockés joueurs, clubs et scores
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'yeti_private'
order by table_name, ordinal_position;

select pg_get_functiondef('public.yeti_get_state(text)'::regprocedure);
select pg_get_functiondef(p.oid) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'yeti_save_scores';

-- 1) Fonction d'ajout. Contrat attendu par le site :
--    yeti_add_player(p_room_code text, p_name text) -> json {"player": {"id": int, "name": text}}
--    Erreurs : 28000 = code du club invalide, 23505 = prénom déjà pris, 22023 = prénom invalide.
--    Hypothèses : yeti_private.rooms(id, code_hash) et yeti_private.players(id, room_id, name).
--    Reprends la vérification du code utilisée dans yeti_get_state (copie-la telle quelle).
create or replace function public.yeti_add_player(p_room_code text, p_name text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id bigint;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_player yeti_private.players%rowtype;
begin
  -- >>> remplacer par la même vérification que dans yeti_get_state <<<
  select r.id into v_room_id
  from yeti_private.rooms r
  where r.code_hash = encode(extensions.digest(p_room_code, 'sha256'), 'hex');
  if v_room_id is null then
    raise exception 'private access required' using errcode = '28000';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 24 then
    raise exception 'invalid player name' using errcode = '22023';
  end if;

  if exists (select 1 from yeti_private.players p
             where p.room_id = v_room_id and lower(p.name) = lower(v_name)) then
    raise exception 'player already exists' using errcode = '23505';
  end if;

  if (select count(*) from yeti_private.players p where p.room_id = v_room_id) >= 20 then
    raise exception 'too many players' using errcode = '22023';
  end if;

  insert into yeti_private.players (room_id, name)
  values (v_room_id, v_name)
  returning * into v_player;

  return json_build_object('player', json_build_object('id', v_player.id, 'name', v_player.name));
end;
$$;

revoke all on function public.yeti_add_player(text, text) from public;
grant execute on function public.yeti_add_player(text, text) to anon, authenticated;

-- 2) Vérifier que :
--    - yeti_get_state renvoie bien les nouveaux joueurs dans "players" (id + name) ;
--    - yeti_save_scores accepte un score dont "player" est l'id d'un joueur de ce club
--      (s'il compare à une liste fixe 1..3, remplacer par un test d'existence dans players).
