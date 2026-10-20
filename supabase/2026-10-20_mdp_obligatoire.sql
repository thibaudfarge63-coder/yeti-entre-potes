-- Changement de mot de passe obligatoire (demandé par l'admin).
-- players.must_change_pw = true : la session du joueur ne compte plus (session_ok), yeti_login renvoie must_change,
-- et le site enchaîne sur « change ton mot de passe ». yeti_change_password(code, player, token, password) remet le flag à false.
alter table yeti_private.players add column if not exists must_change_pw boolean not null default false;
-- Pour forcer un joueur : update yeti_private.players set must_change_pw = true where name = 'Mouna';
