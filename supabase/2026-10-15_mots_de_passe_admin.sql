-- Mot de passe par joueur + admin (Thibaud) qui peut bannir 1, 5, 15, 60 ou 120 min.
-- Déjà appliqué sur le projet bmqkhumtkdtrdxsjjubt (sans aucun DELETE : un ban invalide les sessions via sessions_after).
-- Mot de passe oublié : update yeti_private.players set pin_hash = null where name = 'Prénom';
--   (le joueur en recrée un à sa prochaine connexion)
set lock_timeout = '3s';

alter table yeti_private.players
  add column if not exists pin_hash text,
  add column if not exists pin_fails smallint not null default 0,
  add column if not exists pin_locked_until timestamptz,
  add column if not exists is_admin boolean not null default false,
  add column if not exists banned_until timestamptz,
  add column if not exists sessions_after timestamptz not null default '-infinity';
update yeti_private.players set is_admin = true where lower(name) = 'thibaud';

create table if not exists yeti_private.player_sessions (
  room_id uuid not null references yeti_private.rooms(id) on delete cascade,
  player smallint not null,
  token_hash bytea not null,
  created_at timestamptz not null default now(),
  primary key (room_id, player, token_hash)
);
alter table yeti_private.player_sessions enable row level security;
revoke all on yeti_private.player_sessions from public, anon, authenticated;

create or replace function yeti_private.room_of(p_room_code text) returns uuid
language plpgsql stable security definer set search_path to '' as $$
declare v_room uuid;
begin
  if p_room_code is null or length(p_room_code) not between 4 and 128 then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(p_room_code,'UTF8'));
  if v_room is null then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  return v_room;
end $$;

create or replace function yeti_private.new_session(p_room uuid, p_player smallint) returns text
language plpgsql security definer set search_path to '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into yeti_private.player_sessions (room_id, player, token_hash) values (p_room, p_player, sha256(convert_to(v_token,'UTF8')));
  return v_token;
end $$;

create or replace function yeti_private.session_ok(p_room uuid, p_player integer, p_token text) returns boolean
language sql stable security definer set search_path to '' as $$
  select p_token is not null and exists (select 1 from yeti_private.player_sessions s join yeti_private.players p on p.room_id = s.room_id and p.id = s.player
    where s.room_id = p_room and s.player = p_player and s.token_hash = sha256(convert_to(p_token,'UTF8')) and s.created_at > p.sessions_after);
$$;

create or replace function yeti_private.ban_message(p_until timestamptz) returns text
language sql stable set search_path to '' as $$
  select 'Tu es banni jusqu’à ' || to_char(p_until at time zone 'Europe/Paris', 'HH24"h"MI') || '.';
$$;
revoke all on function yeti_private.room_of(text), yeti_private.new_session(uuid, smallint), yeti_private.session_ok(uuid, integer, text), yeti_private.ban_message(timestamptz) from public, anon, authenticated;

-- Première connexion : le joueur choisit son mot de passe (seulement s'il n'en a pas encore).
create or replace function public.yeti_set_password(p_room_code text, p_player integer, p_password text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); v_p yeti_private.players%rowtype;
begin
  if p_password is null or char_length(p_password) not between 4 and 64 then raise exception using errcode='22023', message='Le mot de passe doit faire entre 4 et 64 caractères.'; end if;
  select * into v_p from yeti_private.players where room_id = v_room and id = p_player for update;
  if not found then raise exception using errcode='22023', message='Joueur inconnu.'; end if;
  if v_p.pin_hash is not null then raise exception using errcode='22023', message='Ce joueur a déjà un mot de passe.'; end if;
  if v_p.banned_until > now() then raise exception using errcode='22023', message=yeti_private.ban_message(v_p.banned_until); end if;
  update yeti_private.players set pin_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 8)), pin_fails = 0, pin_locked_until = null, sessions_after = now() - interval '1 millisecond'
  where room_id = v_room and id = p_player;
  return jsonb_build_object('ok', true, 'token', yeti_private.new_session(v_room, p_player::smallint));
end $$;

create or replace function public.yeti_login(p_room_code text, p_player integer, p_password text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); v_p yeti_private.players%rowtype;
begin
  select * into v_p from yeti_private.players where room_id = v_room and id = p_player for update;
  if not found then raise exception using errcode='22023', message='Joueur inconnu.'; end if;
  if v_p.pin_hash is null then raise exception using errcode='22023', message='Ce joueur n’a pas encore de mot de passe.'; end if;
  if v_p.banned_until > now() then raise exception using errcode='22023', message=yeti_private.ban_message(v_p.banned_until); end if;
  if v_p.pin_locked_until > now() then raise exception using errcode='22023', message='Trop d’essais ratés. Réessaie dans une minute.'; end if;
  if v_p.pin_hash <> extensions.crypt(coalesce(p_password,''), v_p.pin_hash) then
    update yeti_private.players set
      pin_locked_until = case when pin_fails + 1 >= 5 then now() + interval '1 minute' else pin_locked_until end,
      pin_fails = case when pin_fails + 1 >= 5 then 0 else pin_fails + 1 end
    where room_id = v_room and id = p_player;
    return jsonb_build_object('ok', false);
  end if;
  update yeti_private.players set pin_fails = 0, pin_locked_until = null where room_id = v_room and id = p_player;
  return jsonb_build_object('ok', true, 'token', yeti_private.new_session(v_room, p_player::smallint));
end $$;

create or replace function public.yeti_check_session(p_room_code text, p_player integer, p_token text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); v_ban timestamptz;
begin
  select banned_until into v_ban from yeti_private.players where room_id = v_room and id = p_player;
  return jsonb_build_object('ok', yeti_private.session_ok(v_room, p_player, p_token) and not coalesce(v_ban > now(), false),
    'banned_until', case when v_ban > now() then v_ban end);
end $$;

-- Admin : bannir (1, 5, 15, 60, 120 min) ou débannir (0). Le joueur banni est déconnecté.
create or replace function public.yeti_ban(p_room_code text, p_admin integer, p_token text, p_target integer, p_minutes integer) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); v_until timestamptz;
begin
  if not yeti_private.session_ok(v_room, p_admin, p_token)
     or not exists (select 1 from yeti_private.players where room_id = v_room and id = p_admin and is_admin) then
    raise exception using errcode='22023', message='Réservé à l’admin.';
  end if;
  if p_minutes not in (0, 1, 5, 15, 60, 120) then raise exception using errcode='22023', message='Durée de ban incorrecte.'; end if;
  if p_target = p_admin then raise exception using errcode='22023', message='Tu ne peux pas te bannir toi-même.'; end if;
  v_until := case when p_minutes = 0 then null else now() + make_interval(mins => p_minutes) end;
  -- sessions_after = now() : les sessions ouvertes du joueur banni ne sont plus valables.
  update yeti_private.players set banned_until = v_until,
    sessions_after = case when v_until is null then sessions_after else now() end
  where room_id = v_room and id = p_target;
  if not found then raise exception using errcode='22023', message='Joueur inconnu.'; end if;
  return jsonb_build_object('ok', true, 'banned_until', v_until);
end $$;

revoke all on function public.yeti_set_password(text,integer,text), public.yeti_login(text,integer,text),
  public.yeti_check_session(text,integer,text), public.yeti_ban(text,integer,text,integer,integer) from public;
grant execute on function public.yeti_set_password(text,integer,text), public.yeti_login(text,integer,text),
  public.yeti_check_session(text,integer,text), public.yeti_ban(text,integer,text,integer,integer) to anon, authenticated;

-- Présence : renvoie aussi les bans en cours (le joueur banni est éjecté de la page).
create or replace function public.yeti_presence(p_room_code text, p_player integer default null) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code);
begin
  if p_player is not null and p_player > 0 and exists (select 1 from yeti_private.players where room_id = v_room and id = p_player and not coalesce(banned_until > now(), false)) then
    insert into yeti_private.presence (room_id, player, last_seen) values (v_room, p_player, now())
    on conflict (room_id, player) do update set last_seen = excluded.last_seen;
  end if;
  return jsonb_build_object(
    'online', (select coalesce(jsonb_agg(s.player order by s.player), '[]'::jsonb) from yeti_private.presence s join yeti_private.players p on p.room_id = s.room_id and p.id = s.player
               where s.room_id = v_room and s.last_seen > now() - interval '30 seconds' and not coalesce(p.banned_until > now(), false)),
    'bans', (select coalesce(jsonb_object_agg(id, banned_until), '{}'::jsonb) from yeti_private.players where room_id = v_room and banned_until > now()));
end $$;

-- Un joueur banni ne peut plus écrire dans le chat.
create or replace function public.yeti_send_message(p_room_code text, p_player integer, p_body text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); v_body text := btrim(regexp_replace(coalesce(p_body,''),'\s+',' ','g')); v_id bigint; v_ban timestamptz;
begin
  select banned_until into v_ban from yeti_private.players where room_id = v_room and id = p_player;
  if not found then raise exception using errcode='22023', message='Joueur incorrect'; end if;
  if v_ban > now() then raise exception using errcode='22023', message=yeti_private.ban_message(v_ban); end if;
  if char_length(v_body) not between 1 and 280 then raise exception using errcode='22023', message='Message vide ou trop long'; end if;
  if exists (select 1 from yeti_private.messages where room_id = v_room and player = p_player and created_at > now() - interval '1 second') then
    raise exception using errcode='22023', message='Doucement, un message par seconde';
  end if;
  insert into yeti_private.messages (room_id, player, body) values (v_room, p_player, v_body) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- L'état indique qui a déjà un mot de passe, qui est admin et qui est banni.
create or replace function public.yeti_get_state(p_room_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_room uuid; v_scores jsonb; v_players jsonb; v_duels jsonb; v_daily jsonb;
begin
  v_room := yeti_private.room_of(p_room_code);
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'player',player,'played_at',played_at,'score',score,'mode',mode,'ref',ref)) order by played_at, id), '[]'::jsonb)
    into v_scores from yeti_private.scores where room_id = v_room and not is_test;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'skins',skins,'total',total_throws,
      'locked', pin_hash is not null, 'admin', is_admin, 'banned_until', case when banned_until > now() then banned_until end) order by id), '[]'::jsonb)
    into v_players from yeti_private.players where room_id = v_room;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'challenger',challenger,'opponent',opponent,'throws',throws,'status',status,'created_at',created_at,
           'c_n',c_n,'c_sum',c_sum,'o_n',o_n,'o_sum',o_sum) order by id), '[]'::jsonb)
    into v_duels from yeti_private.duels where room_id = v_room and created_at > now() - interval '45 days';
  select coalesce(jsonb_agg(jsonb_build_object('day',day,'player',player,'n',n,'total',total) order by day, player), '[]'::jsonb)
    into v_daily from yeti_private.daily_results where room_id = v_room and day >= (now() at time zone 'Europe/Paris')::date - 70;
  return jsonb_build_object('players',v_players,'scores',v_scores,'duels',v_duels,'daily',v_daily,'server_time',now());
end $$;

-- Les lancers d'un joueur banni sont refusés.
create or replace function public.yeti_save_scores(p_room_code text, p_scores jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_room uuid; v_entry jsonb; v_id text; v_player smallint; v_date timestamptz; v_score numeric;
  v_mode text; v_ref text; v_existing yeti_private.scores%rowtype; v_accepted jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb; v_duel yeti_private.duels%rowtype; v_done integer; v_rows integer;
begin
  if p_room_code is null or length(p_room_code) not between 4 and 128 then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(p_room_code,'UTF8')) for update;
  if v_room is null then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  if jsonb_typeof(p_scores) is distinct from 'array' then raise exception using errcode='22023', message='Liste de scores requise'; end if;
  if jsonb_array_length(p_scores) not between 1 and 100 then raise exception using errcode='22023', message='Entre 1 et 100 scores par envoi'; end if;

  for v_entry in select value from jsonb_array_elements(p_scores) loop
    -- Un lancer invalide (ou d'un joueur banni) ne bloque plus tout l'envoi : il est renvoyé dans "rejected" et le client l'abandonne.
    if jsonb_typeof(v_entry) is distinct from 'object' or jsonb_typeof(v_entry->'id') is distinct from 'string'
       or jsonb_typeof(v_entry->'player') is distinct from 'number' or jsonb_typeof(v_entry->'played_at') is distinct from 'string'
       or jsonb_typeof(v_entry->'score') is distinct from 'number'
       or (v_entry->>'id') !~ '^[a-zA-Z0-9-]{16,80}$' or (v_entry->>'player') !~ '^[0-9]{1,4}$'
       or (v_entry->>'played_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      if jsonb_typeof(v_entry->'id') = 'string' then v_rejected := v_rejected || jsonb_build_array(v_entry->>'id'); end if;
      continue;
    end if;
    v_id := v_entry->>'id';
    v_player := (v_entry->>'player')::smallint;
    begin v_date := (v_entry->>'played_at')::timestamptz; exception when others then v_date := null; end;
    v_score := round((v_entry->>'score')::numeric, 2);
    if v_date is null or v_date > now() + interval '10 minutes' or v_date < timestamptz '2000-01-01 00:00:00+00'
       or v_score < 0 or v_score > 1000000
       or not exists (select 1 from yeti_private.players where room_id = v_room and id = v_player and not coalesce(banned_until > now(), false)) then
      v_rejected := v_rejected || jsonb_build_array(v_id); continue;
    end if;

    select * into v_existing from yeti_private.scores where room_id = v_room and id = v_id;
    if found then
      if v_existing.player = v_player and v_existing.played_at = v_date and v_existing.score = v_score
        then v_accepted := v_accepted || jsonb_build_array(v_id);
        else v_rejected := v_rejected || jsonb_build_array(v_id); end if;
      continue;
    end if;

    v_mode := nullif(v_entry->>'mode',''); v_ref := nullif(v_entry->>'ref','');
    if v_mode = 'daily' then
      v_ref := ((v_date at time zone 'Europe/Paris')::date)::text;
      select n into v_done from yeti_private.daily_results where room_id = v_room and day = v_ref::date and player = v_player;
      if coalesce(v_done,0) >= 10 then v_mode := null; v_ref := null; end if;
    elsif v_mode = 'duel' then
      select * into v_duel from yeti_private.duels where room_id = v_room and id::text = v_ref for update;
      if not found or v_duel.status <> 'accepted' or v_player not in (v_duel.challenger, v_duel.opponent)
         or (case when v_player = v_duel.challenger then v_duel.c_n else v_duel.o_n end) >= v_duel.throws then
        v_mode := null; v_ref := null;
      end if;
    else v_mode := null; v_ref := null; end if;

    insert into yeti_private.scores (room_id, id, player, played_at, score, mode, ref)
    values (v_room, v_id, v_player, v_date, v_score, v_mode, v_ref) on conflict (room_id, id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      update yeti_private.players set total_throws = total_throws + 1 where room_id = v_room and id = v_player;
      if v_mode = 'daily' then
        insert into yeti_private.daily_results (room_id, day, player, n, total) values (v_room, v_ref::date, v_player, 1, v_score)
        on conflict (room_id, day, player) do update set n = daily_results.n + 1, total = daily_results.total + excluded.total;
      elsif v_mode = 'duel' then
        if v_player = v_duel.challenger then update yeti_private.duels set c_n = c_n + 1, c_sum = c_sum + v_score where id = v_duel.id;
        else update yeti_private.duels set o_n = o_n + 1, o_sum = o_sum + v_score where id = v_duel.id; end if;
      end if;
    end if;
    v_accepted := v_accepted || jsonb_build_array(v_id);
  end loop;

  perform yeti_private.prune_scores(v_room);
  return jsonb_build_object('ok', true, 'accepted', v_accepted, 'rejected', v_rejected);
end $$;

