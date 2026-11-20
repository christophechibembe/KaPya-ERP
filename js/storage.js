// La démo ne lit, ne modifie et ne supprime jamais le stockage des comptes réels.
import { isDemo } from './demo-mode.js';
export const DEMO_PREFIX = 'kapya-demo:';
const keyFor = key => (isDemo ? DEMO_PREFIX : '') + key;
const scoped = name => ({
  getItem: key => globalThis[name].getItem(keyFor(key)),
  setItem: (key, value) => globalThis[name].setItem(keyFor(key), value),
  removeItem: key => globalThis[name].removeItem(keyFor(key))
});
export const localStore = scoped('localStorage');
export const sessionStore = scoped('sessionStorage');
export function localKeys() {
  return Object.keys(globalThis.localStorage)
    .filter(key => isDemo ? key.startsWith(DEMO_PREFIX) : !key.startsWith(DEMO_PREFIX))
    .map(key => isDemo ? key.slice(DEMO_PREFIX.length) : key);
}
export function clearDemoStorage() {
  for (const name of ['localStorage', 'sessionStorage']) {
    for (const key of Object.keys(globalThis[name])) {
      if (key.startsWith(DEMO_PREFIX)) globalThis[name].removeItem(key);
    }
  }
}
