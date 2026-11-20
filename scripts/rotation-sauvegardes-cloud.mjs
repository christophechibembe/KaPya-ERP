import { pathToFileURL } from 'node:url';
export function oldBackupArtifacts(artifacts, keep = 8) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('Rétention invalide.');
  return artifacts.filter(a => /^kapya-sauvegarde-\d+$/.test(a.name) && !a.expired)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id).slice(keep);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error('Accès aux artefacts non configuré.');
  const request = async (method, endpoint) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Rotation des sauvegardes : HTTP ${response.status}.`);
    return response.status === 204 ? null : response.json();
  };
  const artifacts = [];
  for (let page = 1; ; page++) {
    const batch = await request('GET', `/actions/artifacts?per_page=100&page=${page}`);
    artifacts.push(...batch.artifacts);
    if (batch.artifacts.length < 100) break;
  }
  const old = oldBackupArtifacts(artifacts);
  for (const artifact of old) await request('DELETE', `/actions/artifacts/${artifact.id}`);
  console.log(`Rotation cloud : ${old.length} ancienne(s) sauvegarde(s) supprimée(s) ; maximum 8 exécutions conservées.`);
}
