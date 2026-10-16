-- Exclusion définitive par l'admin : yeti_ban accepte p_minutes = -1
-- (banned_until = 9999-01-01, levée seulement par « Débannir » = 0).
create or replace function yeti_private.ban_message(p_until timestamptz)
 returns text language sql stable set search_path to ''
as $function$
  select case when p_until >= timestamptz '9000-01-01 00:00+00' then 'Tu es exclu définitivement par l’admin.'
    else 'Tu es banni jusqu’à ' || to_char(p_until at time zone 'Europe/Paris', 'HH24"h"MI') || '.' end;
$function$;

create or replace function public.yeti_ban(p_room_code text, p_admin integer, p_token text, p_target integer, p_minutes integer)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_room uuid := yeti_private.room_of(p_room_code); v_until timestamptz;
begin
  if not yeti_private.session_ok(v_room, p_admin, p_token)
     or not exists (select 1 from yeti_private.players where room_id = v_room and id = p_admin and is_admin) then
    raise exception using errcode='22023', message='Réservé à l’admin.';
  end if;
  if p_minutes not in (-1, 0, 1, 5, 15, 60, 120) then raise exception using errcode='22023', message='Durée de ban incorrecte.'; end if;
  if p_target = p_admin then raise exception using errcode='22023', message='Tu ne peux pas te bannir toi-même.'; end if;
  v_until := case when p_minutes = 0 then null when p_minutes = -1 then timestamptz '9999-01-01 00:00+00' else now() + make_interval(mins => p_minutes) end;
  update yeti_private.players set banned_until = v_until,
    sessions_after = case when v_until is null then sessions_after else now() end
  where room_id = v_room and id = p_target;
  if not found then raise exception using errcode='22023', message='Joueur inconnu.'; end if;
  return jsonb_build_object('ok', true, 'banned_until', v_until);
end $function$;
