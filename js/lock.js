// Verrouillage de l'application par code (propre à cet appareil).
// Le code n'est jamais enregistré en clair. Depuis la version 1.24 : PBKDF2-SHA256, 600 000 itérations, sel aléatoire.
// Les anciens codes (SHA-256 simple) restent valides et sont convertis automatiquement à la première saisie réussie.
// Après plusieurs essais échoués, le code est bloqué quelques instants, avec un délai qui double à chaque nouvel échec.
const KEY = 'kp.lock';
const FAILS_KEY = 'kp.lock.fails';
const ITERATIONS = 600000;
const MAX_TRIES = 5;
const enc = new TextEncoder();
const toHex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const hashLegacy = (pin, salt) => crypto.subtle.digest('SHA-256', enc.encode(`${salt}:${pin}`)).then(toHex);
const hashPbkdf2 = async (pin, salt) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITERATIONS }, key, 256);
  return toHex(bits);
};
const config = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const fails = () => { try { return JSON.parse(localStorage.getItem(FAILS_KEY)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } };
export const AUTO_CHOICES = [[0, 'jamais'], [5, '5 minutes'], [10, '10 minutes'], [30, '30 minutes']];

export const hasPin = () => !!config()?.hash;
// Secondes restantes avant un nouvel essai (0 si l'essai est permis).
export const pinWaitSeconds = () => Math.max(0, Math.ceil((fails().until - Date.now()) / 1000));

export async function setPin(pin, autoMinutes = 10) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Le code doit contenir de 4 à 6 chiffres.');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem(KEY, JSON.stringify({ v: 2, salt, iterations: ITERATIONS, hash: await hashPbkdf2(pin, salt), auto: autoMinutes }));
  localStorage.removeItem(FAILS_KEY);
  resetIdle();
}
export async function checkPin(pin) {
  const c = config();
  if (!c?.hash) return false;
  const wait = pinWaitSeconds();
  if (wait > 0) throw new Error(`Trop d’essais. Réessayez dans ${wait} seconde(s).`);
  const ok = c.v === 2 ? (await hashPbkdf2(pin, c.salt)) === c.hash : (await hashLegacy(pin, c.salt)) === c.hash;
  if (ok) {
    localStorage.removeItem(FAILS_KEY);
    if (c.v !== 2) localStorage.setItem(KEY, JSON.stringify({ ...c, v: 2, iterations: ITERATIONS, salt: c.salt, hash: await hashPbkdf2(pin, c.salt) }));
    return true;
  }
  const f = fails();
  const n = f.n + 1;
  // Après MAX_TRIES échecs : blocage de 30 s, doublé à chaque échec supplémentaire (plafond 15 min).
  const delay = n >= MAX_TRIES ? Math.min(15 * 60, 30 * 2 ** (n - MAX_TRIES)) * 1000 : 0;
  localStorage.setItem(FAILS_KEY, JSON.stringify({ n, until: delay ? Date.now() + delay : 0 }));
  return false;
}
export function removePin() { localStorage.removeItem(KEY); clearTimeout(idleTimer); }
export function setAutoLock(minutes) {
  const c = config(); if (!c) return;
  localStorage.setItem(KEY, JSON.stringify({ ...c, auto: Number(minutes) }));
  resetIdle();
}
export const autoLockMinutes = () => Number(config()?.auto ?? 10);

let locked = false, idleTimer = null, onLogout = () => {};

export function lockNow() {
  if (!hasPin() || locked) return;
  locked = true;
  const screen = document.createElement('div');
  screen.id = 'lock-screen';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', 'Application verrouillée');
  screen.innerHTML = `<form class="lock-card" novalidate>
      <img src="assets/logo-k.png" width="56" height="62" alt="">
      <h1>Application verrouillée</h1>
      <p class="muted">Saisissez votre code pour continuer.</p>
      <label for="lock-pin" class="sr">Code</label>
      <input id="lock-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" required>
      <p class="err" role="alert"></p>
      <button class="btn" type="submit">Déverrouiller</button>
      <button class="ghost" type="button" id="lock-out">Se déconnecter</button>
    </form>`;
  document.body.append(screen);
  const input = screen.querySelector('#lock-pin');
  input.focus();
  screen.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const err = screen.querySelector('.err');
    try {
      if (await checkPin(input.value)) {
        screen.remove(); locked = false; resetIdle();
      } else {
        err.textContent = pinWaitSeconds() ? `Trop d’essais. Réessayez dans ${pinWaitSeconds()} seconde(s).` : 'Code incorrect.';
        input.value = ''; input.focus();
      }
    } catch (error) { err.textContent = error.message; input.value = ''; }
  });
  screen.querySelector('#lock-out').addEventListener('click', () => {
    screen.remove(); locked = false; onLogout();
  });
}

function resetIdle() {
  clearTimeout(idleTimer);
  const minutes = autoLockMinutes();
  if (!hasPin() || !minutes) return;
  idleTimer = setTimeout(lockNow, minutes * 60000);
}

export function initLock({ logout }) {
  onLogout = logout;
  ['pointerdown', 'keydown', 'touchstart'].forEach(name => addEventListener(name, () => { if (!locked) resetIdle(); }, { passive: true }));
  resetIdle();
}
