# Yéti entre potes

Yeti Sports 3 pour Loïc, Alexandre et Thibaud. Le jeu et le classement sont sur la même page.

Les scores sont conservés dans Supabase. Le lien privé du groupe est nécessaire pour accéder aux données. La configuration ne contient que la clé publique. Ne jamais ajouter de clé secrète ou de code de groupe dans ce dépôt.

Analyses par jour, semaine (lundi au dimanche), mois et joueur : nombre de lancers, moyenne, record, médiane, écart-type et évolution des moyennes journalières. Dates en heure de Paris.

## Crédits

Jeu original : Yetisports 3 / Seal Bounce, Chris Hilgert et Edelweiss Medienwerkstatt. L’auteur et les crédits restent visibles dans le jeu. Lecteur Flash : Ruffle 0.7.1, sous licences MIT / Apache, incluses dans le dossier ruffle. L’enveloppe ajoute la collecte des scores et les analyses ; les règles et la physique du jeu sont conservées.

Historique : la base garde les 300 derniers lancers du club et, quoi qu’il arrive, les 10 meilleurs lancers de chaque joueur. Les skins débloqués, le nombre de lancers à vie, les sessions Battle royale et les scores des duels sont enregistrés à part, donc la purge ne leur fait rien perdre (voir supabase/2026-10-15_historique_300.sql).

Site statique servi par GitHub Pages. Données du jeu isolées dans le schéma yeti_private de Supabase.
