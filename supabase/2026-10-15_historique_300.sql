-- Historique des lancers : on garde les 300 derniers lancers du club + les 10 meilleurs de chaque joueur (quelle que soit leur date).
-- Pour que la purge ne casse rien :
--   * players.total_throws : compteur de lancers à vie (skins "50 / 100 lancers au compteur")
--   * daily_results       : résultat de chaque session Battle royale (classement du jour et du mois)
--   * duels.c_n/c_sum/o_n/o_sum : lancers et total de chaque joueur dans un duel
-- Les limites (10 lancers / session, 5 / duel) se basent sur ces compteurs et plus sur les lancers conservés.
-- Déjà appliqué sur le projet bmqkhumtkdtrdxsjjubt. Rejouable sans risque.

alter table yeti_private.players add column if not exists total_throws integer not null default 0;
alter table yeti_private.duels add column if not exists c_n smallint not null default 0;
alter table yeti_private.duels add column if not exists c_sum numeric not null default 0;
alter table yeti_private.duels add column if not exists o_n smallint not null default 0;
alter table yeti_private.duels add column if not exists o_sum numeric not null default 0;

create table if not exists yeti_private.daily_results (
  room_id uuid not null references yeti_private.rooms(id) on delete cascade,
  day date not null,
  player smallint not null,
  n smallint not null default 0,
  total numeric not null default 0,
  primary key (room_id, day, player)
);
alter table yeti_private.daily_results enable row level security;
revoke all on yeti_private.daily_results from public, anon, authenticated;

create index if not exists yeti_scores_player_best on yeti_private.scores (room_id, player, score desc);
create index if not exists yeti_scores_recent on yeti_private.scores (room_id, played_at desc, id desc);

-- Reprise de l'existant (une seule fois : seulement si les compteurs sont vides).
do $$ begin
  if not exists (select 1 from yeti_private.daily_results) then
    insert into yeti_private.daily_results (room_id, day, player, n, total)
    select room_id, ref::date, player, count(*), sum(score) from yeti_private.scores
    where mode = 'daily' and ref ~ '^\d{4}-\d{2}-\d{2}$' group by room_id, ref::date, player;
  end if;
  if not exists (select 1 from yeti_private.duels where c_n > 0 or o_n > 0) then
    update yeti_private.duels d set
      c_n = coalesce((select count(*) from yeti_private.scores s where s.room_id = d.room_id and s.mode = 'duel' and s.ref = d.id::text and s.player = d.challenger), 0),
      c_sum = coalesce((select sum(score) from yeti_private.scores s where s.room_id = d.room_id and s.mode = 'duel' and s.ref = d.id::text and s.player = d.challenger), 0),
      o_n = coalesce((select count(*) from yeti_private.scores s where s.room_id = d.room_id and s.mode = 'duel' and s.ref = d.id::text and s.player = d.opponent), 0),
      o_sum = coalesce((select sum(score) from yeti_private.scores s where s.room_id = d.room_id and s.mode = 'duel' and s.ref = d.id::text and s.player = d.opponent), 0);
  end if;
  if not exists (select 1 from yeti_private.players where total_throws > 0) then
    -- Une partie de l'historique a déjà été purgée : on prend au moins ce que les skins débloqués prouvent.
    update yeti_private.players p set total_throws = greatest(
      (select count(*) from yeti_private.scores s where s.room_id = p.room_id and s.player = p.id),
      case when 'fossil' = any(p.skins) then 100 when 'turtle' = any(p.skins) then 50
           when 'ten' = any(p.skins) then 10 when 'bizut' = any(p.skins) then 1 else 0 end);
  end if;
end $$;

-- Purge : 300 derniers lancers du club + 10 meilleurs de chaque joueur.
create or replace function yeti_private.prune_scores(p_room uuid) returns integer
language plpgsql security definer set search_path to '' as $$
declare v_n integer;
begin
  delete from yeti_private.scores s
  where s.room_id = p_room
    and s.id not in (select id from yeti_private.scores where room_id = p_room order by played_at desc, id desc limit 300)
    and s.id not in (
      select id from (
        select id, row_number() over (partition by player order by score desc, played_at, id) rn
        from yeti_private.scores where room_id = p_room
      ) t where rn <= 10);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function yeti_private.prune_scores(uuid) from public, anon, authenticated;

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
    -- Un lancer invalide ne bloque plus tout l'envoi : il est renvoyé dans "rejected" et le client l'abandonne.
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
       or not exists (select 1 from yeti_private.players where room_id = v_room and id = v_player) then
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

create or replace function public.yeti_get_state(p_room_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_room uuid; v_scores jsonb; v_players jsonb; v_duels jsonb; v_daily jsonb;
begin
  if p_room_code is null or length(p_room_code) not between 4 and 128 then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(p_room_code,'UTF8'));
  if v_room is null then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'player',player,'played_at',played_at,'score',score,'mode',mode,'ref',ref)) order by played_at, id), '[]'::jsonb)
    into v_scores from yeti_private.scores where room_id = v_room and not is_test;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'skins',skins,'total',total_throws) order by id), '[]'::jsonb)
    into v_players from yeti_private.players where room_id = v_room;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'challenger',challenger,'opponent',opponent,'throws',throws,'status',status,'created_at',created_at,
           'c_n',c_n,'c_sum',c_sum,'o_n',o_n,'o_sum',o_sum) order by id), '[]'::jsonb)
    into v_duels from yeti_private.duels where room_id = v_room and created_at > now() - interval '45 days';
  select coalesce(jsonb_agg(jsonb_build_object('day',day,'player',player,'n',n,'total',total) order by day, player), '[]'::jsonb)
    into v_daily from yeti_private.daily_results where room_id = v_room and day >= (now() at time zone 'Europe/Paris')::date - 70;
  return jsonb_build_object('players',v_players,'scores',v_scores,'duels',v_duels,'daily',v_daily,'server_time',now());
end $$;

-- La version change aussi quand un joueur débloque un skin.
create or replace function public.yeti_get_version(p_room_code text) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_room uuid;
begin
  if p_room_code is null or length(p_room_code) not between 4 and 128 then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(p_room_code,'UTF8'));
  if v_room is null then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  return jsonb_build_object(
    'version',
      (select count(*)||'-'||coalesce(extract(epoch from max(received_at))::text,'0') from yeti_private.scores where room_id = v_room and not is_test)
      ||'/'||(select count(*)||'-'||coalesce(max(id),0)||'-'||coalesce(sum(cardinality(skins)),0) from yeti_private.players where room_id = v_room)
      ||'/'||(select coalesce(max(id),0)||'-'||coalesce(extract(epoch from max(answered_at))::text,'0') from yeti_private.duels where room_id = v_room),
    'chat', (select coalesce(max(id),0) from yeti_private.messages where room_id = v_room));
end $$;

grant execute on function public.yeti_save_scores(text,jsonb), public.yeti_get_state(text), public.yeti_get_version(text) to anon, authenticated;

select yeti_private.prune_scores(id) from yeti_private.rooms;
