-- Qui est en ligne : chaque page ouverte appelle yeti_presence toutes les 5 s avec le joueur choisi.
-- Un joueur vu il y a moins de 30 s est affiché « en ligne ». Déjà appliqué sur le projet bmqkhumtkdtrdxsjjubt.
create table if not exists yeti_private.presence (
  room_id uuid not null references yeti_private.rooms(id) on delete cascade,
  player smallint not null,
  last_seen timestamptz not null default now(),
  primary key (room_id, player)
);
alter table yeti_private.presence enable row level security;
revoke all on yeti_private.presence from public, anon, authenticated;

create or replace function public.yeti_presence(p_room_code text, p_player integer default null) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare v_room uuid;
begin
  if p_room_code is null or length(p_room_code) not between 4 and 128 then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(p_room_code,'UTF8'));
  if v_room is null then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  if p_player is not null and p_player > 0 and exists (select 1 from yeti_private.players where room_id = v_room and id = p_player) then
    insert into yeti_private.presence (room_id, player, last_seen) values (v_room, p_player, now())
    on conflict (room_id, player) do update set last_seen = excluded.last_seen;
  end if;
  return jsonb_build_object('online', (select coalesce(jsonb_agg(player order by player), '[]'::jsonb)
    from yeti_private.presence where room_id = v_room and last_seen > now() - interval '30 seconds'));
end $$;
revoke all on function public.yeti_presence(text, integer) from public;
grant execute on function public.yeti_presence(text, integer) to anon, authenticated;
