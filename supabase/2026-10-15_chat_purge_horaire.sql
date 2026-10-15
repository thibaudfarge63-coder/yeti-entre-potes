-- Chat vidé à chaque heure pile (pg_cron) ; le chat n'affiche que les messages de l'heure en cours.
-- Déjà appliqué sur le projet bmqkhumtkdtrdxsjjubt.
create extension if not exists pg_cron;

create or replace function yeti_private.purge_messages() returns integer
language plpgsql security definer set search_path to '' as $$
declare v_n integer;
begin
  delete from yeti_private.messages where created_at < date_trunc('hour', now());
  get diagnostics v_n = row_count; return v_n;
end $$;
revoke all on function yeti_private.purge_messages() from public, anon, authenticated;

create or replace function public.yeti_get_messages(p_room_code text, p_after bigint default 0) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_room uuid; v jsonb;
begin
  if p_room_code is null or length(p_room_code) not between 4 and 128 then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select id into v_room from yeti_private.rooms where code_hash = sha256(convert_to(p_room_code,'UTF8'));
  if v_room is null then raise exception using errcode='28000', message='Code du groupe incorrect'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'player',player,'body',body,'at',created_at) order by id), '[]'::jsonb) into v
  from (select * from yeti_private.messages where room_id = v_room and id > coalesce(p_after,0) and created_at >= date_trunc('hour', now()) order by id desc limit 100) m;
  return jsonb_build_object('messages', v, 'since', date_trunc('hour', now()));
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'yeti-purge-chat';
select cron.schedule('yeti-purge-chat', '0 * * * *', 'select yeti_private.purge_messages()');
