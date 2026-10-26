-- 26 oct. 2026 : quand une partie se lance, les autres salons en attente du même jeu qui partagent un joueur sont supprimés.
-- Petits chameaux et Skull King : au passage lobby -> partie. Duels : à l'acceptation, les autres défis en attente entre les deux mêmes joueurs.
create or replace function yeti_private.drop_other_lobbies() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if old.status = 'lobby' and new.status <> 'lobby' then
    if tg_table_name = 'camel_games' then
      delete from yeti_private.camel_games where room_id = new.room_id and status = 'lobby' and id <> new.id and seats && new.seats;
    else
      delete from yeti_private.sk_games where room_id = new.room_id and status = 'lobby' and id <> new.id and seats && new.seats;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists camel_drop_lobbies on yeti_private.camel_games;
create trigger camel_drop_lobbies after update of status on yeti_private.camel_games for each row execute function yeti_private.drop_other_lobbies();
drop trigger if exists sk_drop_lobbies on yeti_private.sk_games;
create trigger sk_drop_lobbies after update of status on yeti_private.sk_games for each row execute function yeti_private.drop_other_lobbies();

create or replace function yeti_private.drop_other_duels() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    delete from yeti_private.duels where room_id = new.room_id and status = 'pending' and id <> new.id
      and least(challenger, opponent) = least(new.challenger, new.opponent) and greatest(challenger, opponent) = greatest(new.challenger, new.opponent);
  end if;
  return null;
end $$;
drop trigger if exists duels_drop_pending on yeti_private.duels;
create trigger duels_drop_pending after update of status on yeti_private.duels for each row execute function yeti_private.drop_other_duels();

-- Ménage rétroactif : salons en attente créés avant le lancement d'une partie qui partage un joueur.
delete from yeti_private.sk_games l where l.status = 'lobby'
  and exists (select 1 from yeti_private.sk_games g where g.room_id = l.room_id and g.id <> l.id and g.status <> 'lobby' and g.seats && l.seats and coalesce(g.started_at, g.created_at) > l.created_at);
delete from yeti_private.camel_games l where l.status = 'lobby'
  and exists (select 1 from yeti_private.camel_games g where g.room_id = l.room_id and g.id <> l.id and g.status <> 'lobby' and g.seats && l.seats and coalesce(g.started_at, g.created_at) > l.created_at);
