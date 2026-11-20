const url = process.env.KAPYA_WEBHOOK;
if (!url) { console.error('Webhook de sauvegarde cloud non configuré.'); process.exitCode = 1; }
else {
  const success = process.env.KAPYA_RESULTAT === 'success';
  const run = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const message = `${success ? 'Sauvegarde cloud KaPya réussie : copie chiffrée vérifiée et déposée.' : 'ÉCHEC de la sauvegarde cloud KaPya. Vérifiez immédiatement les journaux.'} ${run}`;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message, content: message }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`Notification ${success ? 'de réussite' : 'd’échec'} transmise.`);
  } catch { console.error('La notification distante n’a pas pu être transmise.'); process.exitCode = 1; }
}
