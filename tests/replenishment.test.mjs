import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendOrders } from '../js/replenishment.mjs';
test('réapprovisionnement : ventes, couverture, délai et minimum de stock', () => {
  const articles = [{ id: 'a', stock: 5, min_stock: 8 }, { id: 'b', stock: 100, min_stock: 10 }];
  const sales = [{ sale_lines: [{ article_id: 'a', qty: 30 }, { article_id: 'b', qty: 3 }] }];
  const [result] = recommendOrders(articles, sales);
  assert.equal(result.id, 'a'); assert.equal(result.toOrder, 16); assert.equal(result.daysLeft, 5);
  assert.equal(result.target, 21);
  assert.equal(articles[0].stock, 5);
});
test('réapprovisionnement : sans ventes on se limite au minimum, pas de prévision inventée', () => {
  const result = recommendOrders([{ id: 'a', stock: 2, min_stock: 5 }, { id: 'b', stock: 0, min_stock: 0 }], []);
  assert.equal(result.length, 1); assert.equal(result[0].toOrder, 3); assert.equal(result[0].daysLeft, null);
});
test('réapprovisionnement : quantités fractionnaires, articles archivés et entrées invalides', () => {
  const a = [{ id: 'a', stock: .1, min_stock: 0 }, { id: 'b', stock: 0, min_stock: 5, archived_at: '2026-01-01' }];
  const r = recommendOrders(a, [{ sale_lines: [{ article_id: 'a', qty: 1 }] }], { days: 30, coverageDays: 1, leadDays: 4 });
  assert.equal(r.length, 1); assert.equal(r[0].toOrder, .067);
  assert.throws(() => recommendOrders(a, [], { days: 0 }));
  assert.throws(() => recommendOrders(a, [], { coverageDays: -1 }));
  assert.throws(() => recommendOrders(a, [], { leadDays: NaN }));
});
