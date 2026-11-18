// Règles de paiement d'une vente : une seule source, utilisée par la vente rapide et testée.
// Retourne un message d'erreur, ou null si la vente peut être enregistrée.
import { round2 } from './sale-math.js';

export const OPERATORS = [['airtel', 'Airtel Money'], ['mpesa', 'M-Pesa'], ['orange', 'Orange Money'], ['autre', 'Autre']];
export function validatePayment({ mode, total, advance = 0, deposit = 0, ref = '', aref = '', amode = 'cash', operator = '', aoperator = '', customer = null }) {
  if (!Number.isFinite(Number(total)) || !(total > 0)) return 'Ajoutez au moins un produit avec un total valide.';
  if (!['cash', 'mobile_money', 'bank', 'credit'].includes(mode)) return 'Choisissez un mode de paiement valide.';
  if (!Number.isFinite(Number(deposit)) || deposit < 0 || round2(deposit) > round2(total)) return 'Le montant d’acompte imputé est invalide.';
  const needsRef = m => m === 'mobile_money' || m === 'bank';
  if (mode === 'credit') {
    if (!customer) return 'Pour une vente à crédit, choisissez le client.';
    if (!Number.isFinite(Number(advance))) return 'Saisissez un montant d’acompte valide.';
    if (advance < 0) return 'L’acompte ne peut pas être négatif.';
    const due = round2(total - deposit);
    if (due <= 0) return 'L’acompte couvre tout le total : choisissez Espèces, Mobile money ou Virement.';
    if (round2(advance) >= due) return 'Le montant reçu couvre tout : choisissez Espèces, Mobile money ou Virement.';
    if (advance > 0 && !['cash', 'mobile_money', 'bank'].includes(amode)) return 'Choisissez le mode de réception de l’acompte.';
    if (advance > 0 && needsRef(amode) && String(aref).trim().length < 3) return 'Saisissez la référence de l’acompte (mobile money ou virement).';
    if (advance > 0 && amode === 'mobile_money' && !OPERATORS.some(([v]) => v === aoperator)) return 'Choisissez l’opérateur de l’acompte.';
    return null;
  }
  // Aucun nouvel encaissement si le reçu client couvre déjà toute la vente.
  if (round2(total - deposit) <= 0) return null;
  if (needsRef(mode) && String(ref).trim().length < 3) return 'Saisissez la référence de la transaction (mobile money ou virement).';
  if (mode === 'mobile_money' && !OPERATORS.some(([v]) => v === operator)) return 'Choisissez l’opérateur mobile money.';
  return null;
}

// Montant de caisse physique : seules les espèces comptent (mobile money et virement exclus).
export function cashOnly(movements) {
  return movements.reduce((t, m) => ((m.method || 'cash') === 'cash' ? t + Number(m.amount || 0) : t), 0);
}

// Acompte client existant : montant réellement imputable = le plus petit de la demande, du solde disponible et du total.
export function depositApplied({ total, requested = 0, available = 0 }) {
  const t = Math.max(0, Number(total) || 0);
  const r = Math.max(0, Number(requested) || 0);
  const a = Math.max(0, Number(available) || 0);
  return round2(Math.min(r, a, t));
}

// Répartition d'une vente : ce qui reste à payer en espèces maintenant, ce qui est déjà couvert, et le reste dû.
// Modes espèces, mobile money et virement : la vente est réglée. Crédit : seul l'encaissement saisi est pris en compte.
export function settle({ total, deposit = 0, mode, advance = 0 }) {
  const t = Math.max(0, round2(Number(total) || 0));
  const d = Math.min(t, Math.max(0, round2(Number(deposit) || 0)));
  const cashDue = Math.max(0, round2(t - d));
  const paidNow = mode === 'credit' ? Math.min(cashDue, Math.max(0, round2(Number(advance) || 0))) : cashDue;
  return { cashDue, paidNow, paidTotal: round2(paidNow + d), rest: Math.max(0, round2(cashDue - paidNow)) };
}

// Contrôle de l'acompte avant envoi : client obligatoire, solde suffisant, pas plus que le total.
export function validateDeposit({ total, applied = 0, available = 0, customer = null }) {
  if (!Number.isFinite(Number(applied)) || applied < 0) return 'Saisissez un montant d’acompte valide, positif ou nul.';
  if (!(applied > 0)) return null;
  if (!Number.isFinite(Number(available)) || !Number.isFinite(Number(total))) return 'Impossible de vérifier le solde de l’acompte.';
  if (!customer) return 'Pour utiliser un acompte, choisissez un client enregistré.';
  if (applied > round2(available) + 0.005) return 'Le montant imputé dépasse le solde de l’acompte.';
  if (applied > round2(total) + 0.005) return 'Le montant imputé dépasse le total de la vente.';
  return null;
}
