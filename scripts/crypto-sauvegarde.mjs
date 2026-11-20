import crypto from 'node:crypto';
export function decodeKey(value) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) throw new Error('Clé de sauvegarde invalide : 32 octets encodés en base64 attendus.');
  const key = Buffer.from(text, 'base64');
  if (key.length !== 32 || key.toString('base64') !== text) throw new Error('Clé de sauvegarde invalide.');
  return key;
}
export function encryptBackup(clear, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const bytes = Buffer.concat([cipher.update(clear), cipher.final()]);
  return Buffer.concat([Buffer.from('KAPYA1'), iv, cipher.getAuthTag(), bytes]);
}
export function decryptBackup(content, key) {
  if (content.length < 34 || content.subarray(0, 6).toString() !== 'KAPYA1') throw new Error('Sauvegarde chiffrée non reconnue.');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, content.subarray(6, 18));
  cipher.setAuthTag(content.subarray(18, 34));
  return Buffer.concat([cipher.update(content.subarray(34)), cipher.final()]);
}
