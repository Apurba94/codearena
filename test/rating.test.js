import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeRatingChanges, rankOf } from '../server/services/rating.js';

test('equal ratings: deltas follow rank and are roughly zero-sum', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ userId: i + 1, rank: i + 1, rating: 1500 }));
  const res = computeRatingChanges(rows);
  for (let i = 1; i < res.length; i++) assert.ok(res[i - 1].delta >= res[i].delta);
  assert.ok(res[0].delta > 0 && res.at(-1).delta < 0);
  const sum = res.reduce((s, r) => s + r.delta, 0);
  assert.ok(sum <= 0 && sum > -10 * res.length, `sum ${sum}`);
});

test('upset: low-rated winner gains more than a high-rated winner would', () => {
  const upset = computeRatingChanges([{ userId: 1, rank: 1, rating: 1200 }, { userId: 2, rank: 2, rating: 2000 }]);
  const expected = computeRatingChanges([{ userId: 1, rank: 1, rating: 2000 }, { userId: 2, rank: 2, rating: 1200 }]);
  assert.ok(upset[0].delta > expected[0].delta);
  assert.ok(upset[1].delta < 0);
});

test('unrated participants start from 1500', () => {
  const res = computeRatingChanges([{ userId: 1, rank: 1, rating: null }, { userId: 2, rank: 2, rating: null }]);
  assert.equal(res[0].oldRating, 1500);
  assert.ok(res[0].newRating > 1500 && res[1].newRating < 1500);
});

test('rank titles', () => {
  assert.equal(rankOf(null).title, 'Unrated');
  assert.equal(rankOf(1199).title, 'Newbie');
  assert.equal(rankOf(1650).title, 'Expert');
  assert.equal(rankOf(3100).cls, 'r-legend');
});
