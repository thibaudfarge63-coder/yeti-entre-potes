-- Ajout de joueurs depuis le site ("Add user").
-- À coller tel quel dans Supabase > SQL Editor (projet bmqkhumtkdtrdxsjjubt) puis Run.
-- Loïc (1), Alexandre (2) et Thibaud (3) sont recopiés avec les mêmes numéros : aucun score n'est modifié.

create table if not exists yeti_private.players (
  room_id uuid not null references yeti_private.rooms(id) on delete cascade,
  id smallint not null check (id > 0),
  name text not null check (char_length(name) between 2 and 24),
  created_at timestamptz not null default now(),
  primary key (room_id, id)
);
create unique index if not exists players_room_name_uidx on yeti_private.players (room_id, lower(name));
alter table yeti_private.players enable row level security;
revoke all on yeti_private.players from public, anon, authenticated;

insert into yeti_private.players (room_id, id, name)
select r.id, v.id, v.name from yeti_private.rooms r
cross join (values (1::smallint,'Loïc'),(2::smallint,'Alexandre'),(3::smallint,'Thibaud')) v(id,name)
on conflict do nothing;

create or replace function yeti_private.seed_players() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into yeti_private.players (room_id, id, name)
  values (new.id,1,'Loïc'),(new.id,2,'Alexandre'),(new.id,3,'Thibaud') on conflict do nothing;
  return new;
end; $$;
drop trigger if exists rooms_seed_players on yeti_private.rooms;
create trigger rooms_seed_players after insert on yeti_private.rooms for each row execute function yeti_private.seed_players();

CREATE OR REPLACE FUNCTION public.yeti_get_state(p_room_code text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$ declare v_room uuid;v_scores jsonb;v_players jsonb;begin if p_room_code is null or length(p_room_code) not between 32 and 128 then raise exception using errcode='28000',message='Code du groupe incorrect';end if;select id into v_room from yeti_private.rooms where code_hash=sha256(convert_to(p_room_code,'UTF8'));if v_room is null then raise exception using errcode='28000',message='Code du groupe incorrect';end if;select coalesce(jsonb_agg(jsonb_build_object('id',id,'player',player,'played_at',played_at,'score',score) order by played_at,id),'[]'::jsonb) into v_scores from yeti_private.scores where room_id=v_room and not is_test;select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]'::jsonb) into v_players from yeti_private.players where room_id=v_room;return jsonb_build_object('players',v_players,'scores',v_scores,'server_time',now());end;$function$;

CREATE OR REPLACE FUNCTION public.yeti_save_scores(p_room_code text, p_scores jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$ declare v_room uuid;v_entry jsonb;v_id text;v_player smallint;v_date timestamptz;v_score numeric;v_existing yeti_private.scores%rowtype;v_accepted jsonb:='[]'::jsonb;begin if p_room_code is null or length(p_room_code) not between 32 and 128 then raise exception using errcode='28000',message='Code du groupe incorrect';end if;select id into v_room from yeti_private.rooms where code_hash=sha256(convert_to(p_room_code,'UTF8')) for update;if v_room is null then raise exception using errcode='28000',message='Code du groupe incorrect';end if;if jsonb_typeof(p_scores) is distinct from 'array' then raise exception using errcode='22023',message='Liste de scores requise';end if;if jsonb_array_length(p_scores) not between 1 and 100 then raise exception using errcode='22023',message='Entre 1 et 100 scores par envoi';end if;for v_entry in select value from jsonb_array_elements(p_scores) loop if jsonb_typeof(v_entry) is distinct from 'object' or jsonb_typeof(v_entry->'id') is distinct from 'string' or jsonb_typeof(v_entry->'player') is distinct from 'number' or jsonb_typeof(v_entry->'played_at') is distinct from 'string' or jsonb_typeof(v_entry->'score') is distinct from 'number' then raise exception using errcode='22023',message='Score incomplet';end if;v_id:=v_entry->>'id';if v_id !~ '^[a-zA-Z0-9-]{16,80}$' then raise exception using errcode='22023',message='Identifiant de partie incorrect';end if;if(v_entry->>'player') !~ '^[0-9]{1,4}$' then raise exception using errcode='22023',message='Joueur incorrect';end if;v_player:=(v_entry->>'player')::smallint;if not exists(select 1 from yeti_private.players where room_id=v_room and id=v_player) then raise exception using errcode='22023',message='Joueur incorrect';end if;if(v_entry->>'played_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception using errcode='22023',message='Date avec fuseau horaire requise';end if;v_date:=(v_entry->>'played_at')::timestamptz;if v_date>now()+interval '10 minutes' or v_date<timestamptz '2000-01-01 00:00:00+00' then raise exception using errcode='22023',message='Date de partie incorrecte';end if;v_score:=round((v_entry->>'score')::numeric,2);if v_score<0 or v_score>1000000 then raise exception using errcode='22023',message='Score incorrect';end if;select * into v_existing from yeti_private.scores where room_id=v_room and id=v_id;if found and(v_existing.player<>v_player or v_existing.played_at<>v_date or v_existing.score<>v_score) then raise exception using errcode='22023',message='Identifiant déjà utilisé pour une autre partie';end if;insert into yeti_private.scores(room_id,id,player,played_at,score) values(v_room,v_id,v_player,v_date,v_score) on conflict(room_id,id) do nothing;v_accepted:=v_accepted||jsonb_build_array(v_id);end loop;return jsonb_build_object('ok',true,'accepted',v_accepted);end;$function$;

CREATE OR REPLACE FUNCTION public.yeti_add_player(p_room_code text, p_name text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$ declare v_room uuid;v_name text:=regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g');v_id smallint;v_players jsonb;begin if p_room_code is null or length(p_room_code) not between 32 and 128 then raise exception using errcode='28000',message='Code du groupe incorrect';end if;select id into v_room from yeti_private.rooms where code_hash=sha256(convert_to(p_room_code,'UTF8')) for update;if v_room is null then raise exception using errcode='28000',message='Code du groupe incorrect';end if;if char_length(v_name) not between 2 and 24 or v_name ~ '[<>]' then raise exception using errcode='22023',message='Prénom incorrect';end if;if exists(select 1 from yeti_private.players where room_id=v_room and lower(name)=lower(v_name)) then raise exception using errcode='23505',message='Ce joueur existe déjà';end if;if (select count(*) from yeti_private.players where room_id=v_room)>=30 then raise exception using errcode='22023',message='Le club est complet';end if;select coalesce(max(id),0)+1 into v_id from yeti_private.players where room_id=v_room;insert into yeti_private.players(room_id,id,name) values(v_room,v_id,v_name);select jsonb_agg(jsonb_build_object('id',id,'name',name) order by id) into v_players from yeti_private.players where room_id=v_room;return jsonb_build_object('ok',true,'player',jsonb_build_object('id',v_id,'name',v_name),'players',v_players);end;$function$;

revoke all on function public.yeti_add_player(text,text) from public;
grant execute on function public.yeti_add_player(text,text) to anon, authenticated;
revoke all on function yeti_private.seed_players() from public, anon, authenticated;
