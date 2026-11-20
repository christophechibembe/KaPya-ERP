// Installation : on garde l'événement pour le bouton des paramètres, sans afficher la bannière automatique du navigateur.
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__kapyaInstall = e; });
// Édition « KaPya app » (téléphone) : même application et même base, servie sous /app.
const APP_EDITION = location.pathname.replace(/\/+$/, '').startsWith('/app') ? 'app' : 'erp';
if (APP_EDITION === 'app') {
  document.documentElement.classList.add('edition-app');
  document.title = 'KaPya app';
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = '/manifest-app.webmanifest';
  const apple = document.querySelector('link[rel="apple-touch-icon"]');
  if (apple) apple.href = '/icons/app/apple-touch-icon.png';
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = '/icons/app/icon-512.png';
  const note = document.createElement('div');
  note.id = 'desktop-block';
  note.innerHTML = '<div><h1>KaPya app</h1><p>Cette version est faite pour votre téléphone. Ouvrez-la sur un téléphone, ou utilisez la version ordinateur de KaPya ERP.</p></div>';
  document.body.append(note);
  document.querySelectorAll('.splash-title').forEach(el => { el.textContent = 'Bienvenue dans KaPya app'; });
  document.querySelectorAll('#splash .splash-inner p').forEach(el => { el.innerHTML = el.innerHTML.replace('KaPya ERP', 'KaPya app'); });
}
// Démarrage : message si l'app est ouverte sans serveur, et service worker en production.
if(location.protocol==='file:')document.getElementById('root').innerHTML='<div class="auth"><div class="card"><h1>Ouvrez l’app via le lanceur</h1><p>Dans le dossier de l’application, double-cliquez sur <code>lancer-8106.bat</code>, puis ouvrez <code>http://localhost:8106</code>.</p></div></div>';
// Écran de chargement court (logo seulement) : 1,5 seconde minimum, puis masqué en fondu.
// La bienvenue, elle, est gérée par l’application (une seule fois par compte).
const splash = document.getElementById('splash-brief');
if (splash) {
  const started = Date.now();
  const hideSplash = () => {
    const wait = Math.max(0, 1500 - (Date.now() - started));
    setTimeout(() => { splash.classList.add('done'); setTimeout(() => splash.remove(), 450); }, wait);
  };
  if (document.readyState === 'complete') hideSplash(); else addEventListener('load', hideSplash);
}
if(!/^\/demo(?:\/|$)/.test(location.pathname) && 'serviceWorker' in navigator && location.protocol.startsWith('http'))addEventListener('load',()=>{
  const local = ['localhost','127.0.0.1'].includes(location.hostname);
  if(local) navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
  else navigator.serviceWorker.register('sw.js');
});
