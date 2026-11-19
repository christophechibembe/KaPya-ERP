// Envoie un message de test au webhook d'alerte des sauvegardes.
// N'affiche jamais l'URL, qui est un secret stocké hors du dépôt.
// Usage : node scripts/tester-webhook.mjs
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const chemin = path.join(os.homedir(), '.kapya', 'webhook-sauvegarde.txt');
let url = '';
try {
  url = (await readFile(chemin, 'utf8')).trim();
} catch {
  // fichier absent : traité comme non configuré
}
if (!url) {
  console.error(`Aucun webhook configuré. Renseignez ${chemin}`);
  process.exit(1);
}

let cible;
try {
  cible = new URL(url);
} catch {
  console.error('Le webhook n’est pas une URL valide.');
  process.exit(1);
}
if (cible.protocol !== 'https:' && cible.protocol !== 'http:') {
  console.error('Le webhook doit être une URL http(s).');
  process.exit(1);
}

const message = 'Test alerte KaPya : le webhook fonctionne.';
try {
  const reponse = await fetch(cible, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: message, content: message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!reponse.ok) {
    console.error(`Échec de l’envoi (HTTP ${reponse.status}).`);
    process.exit(1);
  }
  console.log(`Message de test envoyé (HTTP ${reponse.status}).`);
} catch (erreur) {
  console.error(`Échec de l’envoi : ${erreur.message}`);
  process.exit(1);
}
