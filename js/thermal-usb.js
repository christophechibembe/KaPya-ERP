/* KaPya ERP - USB ESC/POS thermal printing (Chrome / Edge)
 * WebUSB requires HTTPS (or localhost), a supported browser and user permission.
 * Some operating systems reserve USB printer-class interfaces; those devices may
 * require a local bridge/driver instead of WebUSB.
 */
const STORAGE_KEY = 'kp.thermal.usb.v1';
const encoder = new TextEncoder();
const ESC = 0x1b, GS = 0x1d;

function readSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}
function saveDevice(device) {
  const value = {
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.productName || 'Imprimante USB',
    manufacturerName: device.manufacturerName || ''
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  return value;
}
function bytes(...values) { return new Uint8Array(values); }
function concat(...arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}
function safeText(value) {
  // Keep a printer-friendly Latin text fallback; full code-page mapping is model-specific.
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function makeTestTicket() {
  const center = bytes(ESC, 0x61, 1);
  const left = bytes(ESC, 0x61, 0);
  const boldOn = bytes(ESC, 0x45, 1), boldOff = bytes(ESC, 0x45, 0);
  const big = bytes(GS, 0x21, 0x11), normal = bytes(GS, 0x21, 0x00);
  const line = encoder.encode('------------------------------------------\n');
  return concat(
    bytes(ESC, 0x40), center, boldOn, big, encoder.encode('KAPYA ERP\n'), normal,
    encoder.encode('TEST IMPRESSION USB\n'), boldOff,
    left, line, encoder.encode('Imprimante : USB ESC/POS\nPapier : 80 mm\nConnexion : reussie si ce ticket sort\n'),
    line, center, encoder.encode('Merci d utiliser KaPya ERP !\n\n\n'),
    // Full cut (supported by printers with an automatic cutter).
    bytes(GS, 0x56, 0x00)
  );
}

async function findOutEndpoint(device) {
  if (!device.configuration) await device.selectConfiguration(1);
  for (const iface of device.configuration.interfaces) {
    for (const alternate of iface.alternates) {
      const endpoint = alternate.endpoints.find(ep => ep.direction === 'out' && ep.type !== 'isochronous');
      if (!endpoint) continue;
      try {
        await device.claimInterface(iface.interfaceNumber);
        if (alternate.alternateSetting && alternate.alternateSetting !== 0) {
          await device.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
        }
        return { interfaceNumber: iface.interfaceNumber, endpointNumber: endpoint.endpointNumber };
      } catch (error) {
        // Continue looking: an OS driver may have claimed this interface.
      }
    }
  }
  throw new Error('Aucune interface USB imprimable accessible. Le pilote du système peut réserver cette imprimante.');
}

export function thermalUsbCard() {
  const supported = !!navigator.usb;
  const saved = readSaved();
  return `<section class="card set" id="kp-thermal-usb">
    <div class="set-main"><h2>Imprimantes thermiques</h2>
      <p class="muted">Connexion directe USB en ESC/POS. Première étape : USB. Bluetooth et réseau LAN seront ajoutés ensuite.</p>
    </div>
    <div class="set-main"><b>Connexion USB</b>
      <p class="muted" id="kp-usb-status">${supported ? (saved ? `Dernière imprimante : ${saved.productName}` : 'Aucune imprimante USB sélectionnée.') : 'WebUSB indisponible dans ce navigateur.'}</p>
      <div class="acts"><button class="btn" type="button" id="kp-usb-connect" ${supported ? '' : 'disabled'}>Choisir / connecter une imprimante</button>
      <button class="ghost" type="button" id="kp-usb-test" ${supported ? '' : 'disabled'}>Tester l’impression</button>
      <button class="ghost" type="button" id="kp-usb-disconnect">Effacer la sélection</button></div>
      <p class="muted" id="kp-usb-help">Utilisez Chrome ou Edge sur HTTPS. Le navigateur demandera l’autorisation d’accéder à l’imprimante.</p>
    </div>
    <div class="set-main"><b>Compatibilité</b><p class="muted">ABM V320L UL : USB + ESC/POS (80 mm). Les autres modèles USB ESC/POS pourront être essayés via le sélecteur. Certains pilotes USB bloquent l’accès direct WebUSB.</p></div>
  </section>`;
}

export function bindThermalUsb(main) {
  const card = main.querySelector('#kp-thermal-usb');
  if (!card) return;
  const status = card.querySelector('#kp-usb-status');
  const help = card.querySelector('#kp-usb-help');
  const connectBtn = card.querySelector('#kp-usb-connect');
  const testBtn = card.querySelector('#kp-usb-test');
  const disconnectBtn = card.querySelector('#kp-usb-disconnect');
  let device = null;
  let endpoint = null;
  let busy = false;

  const setStatus = message => { status.textContent = message; };
  async function connect(existing = false) {
    if (!navigator.usb) throw new Error('WebUSB non disponible. Utilisez Chrome ou Edge à jour.');
    if (existing) {
      const devices = await navigator.usb.getDevices();
      const saved = readSaved();
      device = devices.find(d => saved && d.vendorId === saved.vendorId && d.productId === saved.productId) || null;
      if (!device) throw new Error('Autorisation USB à renouveler : cliquez sur « Choisir / connecter ».');
    } else {
      // WebUSB exige obligatoirement une propriété `filters` (contrairement à Web Bluetooth).
      // Un tableau vide laisse Chrome/Edge afficher les périphériques USB compatibles
      // et l'utilisateur choisit explicitement son imprimante.
      device = await navigator.usb.requestDevice({ filters: [] });
      saveDevice(device);
    }
    await device.open();
    endpoint = await findOutEndpoint(device);
    setStatus(`Connectée : ${device.productName || 'Imprimante USB'} (USB)`);
    help.textContent = 'Imprimante prête. Vous pouvez lancer un test d’impression.';
  }
  async function send(data) {
    if (!device || !device.opened || !endpoint) await connect(true);
    // USB bulk endpoints generally accept chunks; keep payloads modest.
    const chunkSize = 16 * 1024;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.slice(offset, Math.min(offset + chunkSize, data.length));
      const result = await device.transferOut(endpoint.endpointNumber, chunk);
      if (result.status !== 'ok') throw new Error(`Échec du transfert USB : ${result.status}`);
    }
  }
  async function run(action) {
    if (busy) return;
    busy = true; connectBtn.disabled = testBtn.disabled = disconnectBtn.disabled = true;
    try { await action(); }
    catch (error) { setStatus(error.message || 'Connexion USB impossible.'); help.textContent = 'Vérifiez le câble, l’alimentation, les autorisations et la compatibilité WebUSB.'; }
    finally { busy = false; connectBtn.disabled = !navigator.usb; testBtn.disabled = !navigator.usb; disconnectBtn.disabled = false; }
  }
  connectBtn.addEventListener('click', () => run(() => connect(false)));
  testBtn.addEventListener('click', () => run(async () => {
    await send(makeTestTicket());
    setStatus('Test envoyé à l’imprimante. Vérifiez la sortie du ticket.');
  }));
  disconnectBtn.addEventListener('click', () => run(async () => {
    if (device?.opened) await device.close();
    device = null; endpoint = null; localStorage.removeItem(STORAGE_KEY);
    setStatus('Sélection USB effacée.');
    help.textContent = 'Reconnectez une imprimante pour effectuer un test.';
  }));
  if (navigator.usb) {
    navigator.usb.addEventListener('disconnect', event => {
      if (device && event.device === device) { device = null; endpoint = null; setStatus('Imprimante USB déconnectée.'); }
    });
    // Restore a previously authorized device without prompting.
    connect(true).catch(() => {});
  }
}

// ── Impression réelle des tickets (ventes, factures) sur l'imprimante USB choisie ──
// Texte ASCII uniquement : les accents sont retirés pour éviter les caractères illisibles.
const money = v => Number(v || 0).toFixed(2).replace('.', ',') + ' $';
const clip = (s, n) => String(s ?? '').slice(0, n);
const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);

// Construit les octets ESC/POS d'un ticket à partir des données du document (même format que l'aperçu)
export function buildTicketBytes(d, paperWidthChars = 42, logo = null) {
  const W = paperWidthChars;
  const line = encoder.encode('-'.repeat(W) + '\n');
  const parts = [bytes(ESC, 0x40)]; // initialisation
  const center = bytes(ESC, 0x61, 1), left = bytes(ESC, 0x61, 0);
  const boldOn = bytes(ESC, 0x45, 1), boldOff = bytes(ESC, 0x45, 0);
  // Logo en image 1 bit : l'imprimante thermique ne sait pas lire un PNG, il faut lui envoyer des points.
  if (logo && logo.bytes?.length) {
    parts.push(center, bytes(GS, 0x76, 0x30, 0x00, logo.bytesPerRow & 0xff, (logo.bytesPerRow >> 8) & 0xff,
      logo.height & 0xff, (logo.height >> 8) & 0xff), logo.bytes, encoder.encode('\n'), left);
  }
  parts.push(center, boldOn, encoder.encode(safeText(d.org || 'KAPYA ERP') + '\n'), boldOff);
  parts.push(encoder.encode(safeText((d.title || 'FACTURE') + ' ' + (d.number || '') + '\n')));
  parts.push(encoder.encode(safeText(d.date || '') + '\n'), left, line);
  parts.push(encoder.encode(safeText('Client : ' + (d.client || 'Client comptoir')) + '\n'));
  parts.push(line, encoder.encode(pad('Article', W - 17) + pad('Qte', 5) + clip('Total', 12).padStart(12) + '\n'), line);
  for (const l of d.lines || []) {
    const name = safeText(l.name);
    parts.push(encoder.encode(clip(name, W) + '\n'));
    const detail = `  ${l.qty} x ${money(l.price)}`;
    parts.push(encoder.encode(pad(detail, W - 12) + money(l.total ?? (Number(l.qty) * Number(l.price))).padStart(12) + '\n'));
  }
  parts.push(line);
  parts.push(encoder.encode(pad('TOTAL', W - 12) + money(d.total).padStart(12) + '\n'));
  if (d.paid !== undefined && d.paid !== null) parts.push(encoder.encode(pad('Verse', W - 12) + money(d.paid).padStart(12) + '\n'));
  if (d.credit) parts.push(encoder.encode(pad('Reste', W - 12) + money(Math.max(0, Number(d.total) - Number(d.paid || 0))).padStart(12) + '\n'));
  parts.push(line, center, encoder.encode('Merci de votre confiance !\n'), encoder.encode(safeText('Propulse par KaPya ERP\n\n\n')));
  parts.push(bytes(GS, 0x56, 0x00)); // coupe automatique si présente
  return concat(...parts);
}

// Envoie des octets à l'imprimante USB enregistrée. Retourne false si aucune imprimante n'est prête.
export async function printRawUsb(data) {
  if (!navigator.usb) return false;
  const saved = readSaved();
  if (!saved) return false;
  const devices = await navigator.usb.getDevices();
  const device = devices.find(d => d.vendorId === saved.vendorId && d.productId === saved.productId);
  if (!device) return false;
  if (!device.opened) await device.open();
  const endpoint = await findOutEndpoint(device);
  const chunkSize = 16 * 1024;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const result = await device.transferOut(endpoint.endpointNumber, data.slice(offset, offset + chunkSize));
    if (result.status !== 'ok') throw new Error(`Échec du transfert USB : ${result.status}`);
  }
  return true;
}

// Convertit le logo de l'entreprise (data URI, URL ou fichier local) en image 1 bit pour l'ESC/POS.
// Une imprimante thermique ne sait pas lire un PNG : on lui envoie une trame de points.
export async function rasterizeLogo(source, maxWidthDots = 320) {
  if (!source) return null;
  try {
    const image = await loadImage(source);
    const natural = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!natural || !naturalHeight) return null;
    const width = Math.max(8, Math.min(maxWidthDots, natural));
    const height = Math.max(1, Math.round(width * naturalHeight / natural));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const bytesPerRow = Math.ceil(width / 8);
    const bytes = new Uint8Array(bytesPerRow * height);
    let ink = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const alpha = pixels[index + 3] / 255;
        // Fond blanc pour la transparence, puis seuil : sombre = point imprimé.
        const light = (0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]) * alpha + 255 * (1 - alpha);
        if (light < 150) { bytes[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7); ink++; }
      }
    }
    if (ink < 20) return null; // image vide ou entièrement blanche : rien à imprimer
    return { width, height, bytesPerRow, bytes };
  } catch { return null; }
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Logo illisible'));
    image.src = source;
  });
}
