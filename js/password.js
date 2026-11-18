// Refus des mots de passe trop faciles (liste courte des plus fréquents, séquences, répétitions, lien avec l'e-mail).
const COMMON_PASSWORDS = ['password', 'password1', 'password123', 'motdepasse', 'azerty', 'azerty123', 'qwerty', 'qwerty123', 'admin', 'admin123', 'administrateur', 'bienvenue', 'bienvenue123', 'kapya', 'kapya123', 'kapya2026', 'congo', 'kinshasa', 'bukavu', 'soleil', '123456', '1234567', '12345678', '123456789', '1234567890', '00000000', '11111111', 'abc12345', 'letmein', 'welcome', 'iloveyou'];
export function weakPasswordReason(password, email = '') {
  const pw = String(password || '');
  if (pw.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  const low = pw.toLowerCase();
  if (COMMON_PASSWORDS.includes(low)) return 'Ce mot de passe est trop courant. Choisissez-en un autre.';
  if (/^(.)\1+$/.test(pw)) return 'Un mot de passe ne doit pas être une seule lettre ou un seul chiffre répété.';
  if (/^(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf)/.test(low)) return 'Évitez les suites évidentes (1234, abcd, qwer…).';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return 'Le mot de passe ne doit pas contenir votre adresse e-mail.';
  return '';
}
