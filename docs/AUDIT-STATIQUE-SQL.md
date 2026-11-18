# Audit statique du SQL

Généré par `node scripts/auditer-sql.mjs`. Analyse du SQL versionné uniquement :
aucune connexion à la base, aucune garantie que ces fichiers sont appliqués en production.

- Tables déclarées : **28**
- Tables avec RLS activée : **28**
- Politiques RLS : **25**
- Fonctions : **93**, dont **65** en `SECURITY DEFINER`
- Migrations : **28**

## Tables sans RLS (0)

Aucune.

## Tables avec RLS mais sans politique (0)

Aucune.

## Tables fermées volontairement (3)

RLS active, aucune politique : seul un accès par fonction `SECURITY DEFINER` est possible.

- `customer_deposit_counters`
- `invoice_counters`
- `platform_admins`

## Fonctions SECURITY DEFINER sans SET search_path (0)

Aucune.

## Fonctions SECURITY DEFINER exécutables par anon (0)

Aucune.

## Versions de migration en collision (0)

Aucune.

## Noms de migration non conformes

Aucune.
