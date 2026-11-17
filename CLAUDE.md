# Yeti rich club

Site entre potes : Yetisports 3 (Seal Bounce, SWF via Ruffle) + classements, Battle royale, duels (Yéti, échecs, bataille navale), petits chameaux, Skull King, chat, notifs push. Réponds en français, tutoiement.

## Stack
- Site statique sans build, servi par GitHub Pages depuis `main` (https://thibaudfarge63-coder.github.io/yeti-entre-potes/).
- JS vanilla en IIFE, un fichier par module. Pas de framework, pas de npm côté site.
- Données : Supabase `bmqkhumtkdtrdxsjjubt`, schéma `yeti_private` (jamais exposé). Le site n'appelle que des fonctions `public.yeti_*` (security definer) via `data-client.js`, avec la clé publique de `config.js`.
- Skull King : logique côté serveur, fonction Edge `yeti-skull` (moteur `engine.js` + `index.ts`).
- Notifs : `yeti_private.push` (filtre) → `push_send` → fonction Edge `yeti-push`. Rappels de tour : pg_cron `yeti-turn-reminders` toutes les 20 s.

## Règles
- Jamais de secret dans le dépôt (service_role, VAPID privée, push_secret, GIPHY, code du club).
- À chaque mise en ligne, monte le numéro `?v=AAAAMMJJ-NN` de TOUS les `<script>`/`<link>` de `index.html` (cache des téléphones).
- Tout changement de base = un fichier `supabase/AAAA-MM-JJ_sujet.sql` commité + appliqué via le MCP Supabase. Fonctions modifiées : récupère d'abord la définition en ligne (`pg_get_functiondef`), le dépôt n'est pas toujours à jour.
- Teste en local (`python3 -m http.server 8765`) sur ordi ET téléphone (375 px) avant de pousser. Les visuels sont faits maison : jamais d'illustrations, logos ou cartes du jeu Skull King original ni de BGA.
- Textes du site en français familier, heures en Europe/Paris.
- Admin = Thibaud (is_admin), modo = Alexandre (is_mod) : seuls eux suppriment des parties.

## Décisions à garder
- Notifs de jeu : une seule par tour, après 1 min d'inaction, seulement si le joueur n'est pas sur le site. Invitations = « ton tour ». Autres notifs : pas deux fois le même type en moins d'1 min.
- Quand une partie se lance, les autres salons en attente du même jeu qui partagent un joueur sont supprimés.
- Bouton « Quitter la partie » (place gardée) + bandeau « Tes parties en cours » + reprise auto (localStorage `yeti-resume`).
- Skull King : règles détaillées dans `docs/skull-king-decisions.md`. Joker 15 = jaune/violet/vert, prend la couleur demandée, jamais noir.
- Skull King : la couleur demandée est celle de la 1re carte de couleur posée dans le pli, même après des cartes spéciales. Moteur dans `supabase/functions/yeti-skull/`, tests : `tests/skull-engine-test.html`.
- Erreurs JS des joueurs : `yeti_private.push_debug` (step = 'jserr').
