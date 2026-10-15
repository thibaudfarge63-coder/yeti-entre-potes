-- Notifications push (appli installée sur téléphone / ordi) :
--   * tag @Prénom ou @tous dans le chat -> notification au joueur tagué
--   * un joueur entre (ou monte) dans le top 5 du Hall of Fame -> notification à tous les autres
-- L'envoi passe par pg_net -> Edge Function « yeti-push » (code : supabase/yeti-push-function.ts).
-- Les clés VAPID et le secret partagé sont dans yeti_private.settings (jamais dans le dépôt).
-- Déjà appliqué sur le projet bmqkhumtkdtrdxsjjubt.
create extension if not exists pg_net;
create table if not exists yeti_private.settings (key text primary key, value text not null);
alter table yeti_private.settings enable row level security;
revoke all on yeti_private.settings from public, anon, authenticated;
-- insert into yeti_private.settings values ('vapid_public', '...'), ('vapid_private', '...'), ('push_secret', '...'),
--   ('push_url', 'https://<projet>.supabase.co/functions/v1/yeti-push'), ('site_url', 'https://thibaudfarge63-coder.github.io/yeti-entre-potes/');

create table if not exists yeti_private.push_subscriptions (
  endpoint text primary key,
  room_id uuid not null references yeti_private.rooms(id) on delete cascade,
  player smallint not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_player on yeti_private.push_subscriptions(room_id, player);
alter table yeti_private.push_subscriptions enable row level security;
revoke all on yeti_private.push_subscriptions from public, anon, authenticated;

create or replace function yeti_private.push(p_room uuid, p_players integer[], p_title text, p_body text, p_url text, p_tag text) returns void
language plpgsql security definer set search_path to '' as $$
declare v_subs jsonb; v_url text; v_secret text; v_site text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('endpoint',endpoint,'keys',jsonb_build_object('p256dh',p256dh,'auth',auth))), '[]'::jsonb)
    into v_subs from yeti_private.push_subscriptions where room_id = p_room and player = any(p_players);
  if jsonb_array_length(v_subs) = 0 then return; end if;
  select value into v_url from yeti_private.settings where key = 'push_url';
  select value into v_secret from yeti_private.settings where key = 'push_secret';
  select value into v_site from yeti_private.settings where key = 'site_url';
  perform net.http_post(url := v_url,
    body := jsonb_build_object('secret', v_secret, 'subs', v_subs,
      'payload', jsonb_build_object('title', p_title, 'body', p_body, 'url', v_site || coalesce(p_url,''), 'tag', p_tag)),
    headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 10000);
exception when others then
  raise warning 'push failed: %', sqlerrm;
end $$;
revoke all on function yeti_private.push(uuid, integer[], text, text, text, text) from public, anon, authenticated;

create or replace function public.yeti_push_subscribe(p_room_code text, p_player integer, p_token text, p_sub jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); v_ep text := p_sub->>'endpoint';
begin
  if not yeti_private.session_ok(v_room, p_player, p_token) then raise exception using errcode='22023', message='Reconnecte-toi pour activer les notifications.'; end if;
  if v_ep is null or v_ep !~ '^https://' or length(v_ep) > 1000 or (p_sub->'keys'->>'p256dh') is null or (p_sub->'keys'->>'auth') is null then
    raise exception using errcode='22023', message='Abonnement aux notifications invalide.';
  end if;
  insert into yeti_private.push_subscriptions (endpoint, room_id, player, p256dh, auth)
  values (v_ep, v_room, p_player, p_sub->'keys'->>'p256dh', p_sub->'keys'->>'auth')
  on conflict (endpoint) do update set room_id = excluded.room_id, player = excluded.player, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.yeti_push_subscribe(text,integer,text,jsonb) from public;
grant execute on function public.yeti_push_subscribe(text,integer,text,jsonb) to anon, authenticated;

-- Chat : notification au(x) joueur(s) tagué(s) avec @Prénom (ou @tous).
create or replace function public.yeti_send_message(p_room_code text, p_player integer, p_body text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_room uuid := yeti_private.room_of(p_room_code); v_body text := btrim(regexp_replace(coalesce(p_body,''),'\s+',' ','g')); v_id bigint; v_ban timestamptz;
  v_name text; v_all boolean; v_targets integer[]; v_text text;
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
    v_all := v_body ~* '(^|[^[:alnum:]_])@(tous|all|everyone)($|[^[:alnum:]_])';
    select array_agg(id::integer) into v_targets from yeti_private.players
      where room_id = v_room and id <> p_player
        and (v_all or v_body ~* ('(^|[^[:alnum:]_])@' || regexp_replace(name, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '($|[^[:alnum:]_])'));
    if v_targets is not null then
      v_text := case when v_body ~ '^\[g:' then 'a envoyé un GIF' when v_body ~ '^\[s:' then substring(v_body from 4 for char_length(v_body) - 4) else left(v_body, 140) end;
      perform yeti_private.push(v_room, v_targets, '💬 ' || v_name || ' t’a tagué', v_text, '?open=chat', 'chat');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Lancers : + notification Hall of Fame.
create or replace function public.yeti_save_scores(p_room_code text, p_scores jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_room uuid; v_entry jsonb; v_id text; v_player smallint; v_date timestamptz; v_score numeric;
  v_mode text; v_ref text; v_existing yeti_private.scores%rowtype; v_accepted jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb; v_duel yeti_private.duels%rowtype; v_done integer; v_rows integer;
  v_old numeric; v_rank_new integer; v_rank_old integer; v_name text;
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

    select max(score) into v_old from yeti_private.scores where room_id = v_room and player = v_player;
    insert into yeti_private.scores (room_id, id, player, played_at, score, mode, ref)
    values (v_room, v_id, v_player, v_date, v_score, v_mode, v_ref) on conflict (room_id, id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      update yeti_private.players set total_throws = total_throws + 1 where room_id = v_room and id = v_player;
      -- Notification : le joueur entre (ou monte) dans le top 5 du Hall of Fame.
      if v_score > 0 and (v_old is null or v_score > v_old) then
        select 1 + count(*) into v_rank_new from (select max(score) b from yeti_private.scores where room_id = v_room and player <> v_player group by player) t where t.b > v_score;
        if v_old is not null then
          select 1 + count(*) into v_rank_old from (select max(score) b from yeti_private.scores where room_id = v_room and player <> v_player group by player) t where t.b > v_old;
        else v_rank_old := null; end if;
        if v_rank_new <= 5 and (v_rank_old is null or v_rank_new < v_rank_old) then
          select name into v_name from yeti_private.players where room_id = v_room and id = v_player;
          perform yeti_private.push(v_room, array(select id::integer from yeti_private.players where room_id = v_room and id <> v_player),
            '🏆 Hall of Fame', v_name || case when v_rank_new = 1 then ' prend la 1re place du Hall of Fame'
              when v_rank_old <= 5 then ' passe ' || v_rank_new || 'e du Hall of Fame'
              else ' entre dans le top 5 du Hall of Fame (' || v_rank_new || 'e)' end
              || ' avec ' || replace(rtrim(to_char(v_score, 'FM999990.99'), '.'), '.', ',') || ' m !', '?open=top', 'hof');
        end if;
      end if;
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

