// Démarrage : message si l'app est ouverte sans serveur, et enregistrement du service worker.
if(location.protocol==='file:')document.getElementById('root').innerHTML='<div class="auth"><div class="card"><h1>Ouvrez l’app via le lanceur</h1><p>Dans le dossier de l’application, double-cliquez sur <code>lancer-8106.bat</code>, puis ouvrez <code>http://localhost:8106</code>.</p></div></div>'
if('serviceWorker' in navigator && location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('sw.js'));
