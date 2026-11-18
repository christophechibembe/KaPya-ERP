# Audit statique du SQL

Généré par `node scripts/auditer-sql.mjs`. Analyse du SQL versionné uniquement :
aucune connexion à la base, aucune garantie que ces fichiers sont appliqués en production.

- Tables déclarées : **64**
- Tables avec RLS activée : **64**
- Tables avec au moins une politique : **63**
- Fonctions : **211**, dont **172** en `SECURITY DEFINER`
- Migrations : **28**

## Tables sans RLS (0)

Aucune.

## Tables avec RLS mais sans politique (0)

Aucune.

## Tables fermées volontairement (1)

RLS active, aucune politique : seul un accès par fonction `SECURITY DEFINER` est possible.

- `document_counters`

## Fonctions SECURITY DEFINER sans SET search_path (0)

Aucune.

## Fonctions SECURITY DEFINER exécutables par anon (0)

Aucune.

## Versions de migration en collision (0)

Aucune.

## Noms de migration non conformes

Aucune.
