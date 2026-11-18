// Pilote Chromium via son protocole natif : aucune dépendance de test ni de production.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const browserPath = [
  process.env.KAPYA_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'
].find(file => file && existsSync(file));
export const artifactDir = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Temp', 'opencode')
  : path.join(os.tmpdir(), 'kapya-tests');

export async function openBrowser(t) {
  await mkdir(artifactDir, { recursive: true });
  const profile = await mkdtemp(path.join(artifactDir, 'kapya-browser-'));
  const processHandle = spawn(browserPath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-extensions', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(async () => {
    if (processHandle.exitCode == null && processHandle.signalCode == null) {
      processHandle.kill();
      await once(processHandle, 'exit').catch(() => {});
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  });
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    processHandle.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    processHandle.once('error', reject);
    processHandle.once('exit', code => reject(new Error(`Navigateur arrêté (${code}) : ${output}`)));
  });
  const socket = new WebSocket(endpoint);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map(), listeners = new Set();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const job = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) job?.reject(new Error(message.error.message));
      else job?.resolve(message.result);
    } else for (const listener of listeners) listener(message);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  t.after(() => socket.close());
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  await command('Page.enable');
  const errors = [];
  await command('Runtime.enable');
  listeners.add(message => {
    if (message.sessionId === sessionId && message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      errors.push(details.exception?.description || details.text);
    }
  });
  return {
    command, errors,
    async viewport(width, height) {
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    },
    async goto(url) {
      const loaded = new Promise(resolve => {
        const listener = message => {
          if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') {
            listeners.delete(listener); resolve();
          }
        };
        listeners.add(listener);
      });
      await command('Page.navigate', { url });
      await loaded;
    },
    async evaluate(expression) {
      const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    }
  };
}
