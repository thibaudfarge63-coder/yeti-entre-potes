-- Surnom dans le chat (ex. Imany apparaît comme « Vladi »). @surnom et @prénom taguent tous les deux.
alter table yeti_private.players add column if not exists chat_name text check (chat_name is null or char_length(chat_name) between 1 and 24);
update yeti_private.players set chat_name = 'Vladi' where name = 'Imany';
-- yeti_get_state : chaque joueur a aussi 'chat' = chat_name.
-- yeti_send_message : la notif de tag utilise coalesce(chat_name, name).
-- yeti_private.mention_targets : un @chat_name tague aussi le joueur.
