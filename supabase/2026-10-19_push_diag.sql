-- Diagnostic des notifications (Android) : appareil (ua) enregistré avec chaque abonnement,
-- journal des étapes côté téléphone, et notif de test envoyée à soi-même.
alter table yeti_private.push_subscriptions add column if not exists ua text;
create table if not exists yeti_private.push_debug (id bigserial primary key, room_id uuid, player integer, ua text, step text, msg text, at timestamptz default now());
-- public.yeti_push_subscribe : enregistre aussi ua = left(p_sub->>'ua', 300)
-- public.yeti_push_test(p_room_code, p_player, p_token) -> {ok, devices} : envoie « 🔔 Test réussi ! » à ses propres appareils
-- public.yeti_push_diag(p_room_code, p_player, p_step, p_msg, p_ua) -> {ok} : écrit dans push_debug (30/min max)
-- Lire le journal : select * from yeti_private.push_debug order by id desc limit 50;
