/**
 * Codeforces-style Elo rating update.
 *
 * For each contestant: seed = expected rank given everyone's rating; the target is the geometric
 * mean of seed and actual rank; we binary-search the rating whose seed equals that target and move
 * halfway towards it. Two corrections keep the system from inflating: the total change is pushed
 * slightly negative, and the top-rated contestants' changes are nudged to sum to ~0.
 */
export const INITIAL_RATING = 1500;

const winProbability = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

function seedFor(ratings, rating) {
  let seed = 1;
  for (const r of ratings) seed += winProbability(r, rating);
  return seed;
}

function ratingForRank(ratings, rank) {
  let lo = 1;
  let hi = 8000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (seedFor(ratings, mid) < rank) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * @param {{userId:number, rank:number, rating:number|null}[]} rows  rank: 1-based, ties share the worse rank
 * @returns {{userId:number, rank:number, oldRating:number, newRating:number, delta:number}[]}
 */
export function computeRatingChanges(rows) {
  const cs = rows.map((r) => ({ ...r, rating: r.rating ?? INITIAL_RATING }));
  const n = cs.length;
  if (n === 0) return [];
  const all = cs.map((c) => c.rating);

  for (const c of cs) {
    // expected rank against everybody else (exclude self: P(self beats self) = 0.5)
    c.seed = seedFor(all, c.rating) - 0.5;
    const mid = Math.sqrt(c.rank * c.seed);
    const need = ratingForRank(all, mid);
    c.delta = Math.trunc((need - c.rating) / 2);
  }

  // 1) total sum slightly negative
  const sum = cs.reduce((s, c) => s + c.delta, 0);
  const inc = Math.trunc(-sum / n) - 1;
  for (const c of cs) c.delta += inc;

  // 2) top contestants by rating should not gain in aggregate
  const byRating = [...cs].sort((a, b) => b.rating - a.rating);
  const top = Math.min(n, 4 * Math.round(Math.sqrt(n)));
  const sumTop = byRating.slice(0, top).reduce((s, c) => s + c.delta, 0);
  const inc2 = Math.min(Math.max(Math.trunc(-sumTop / top), -10), 0);
  for (const c of cs) c.delta += inc2;

  return cs.map((c) => ({
    userId: c.userId,
    rank: c.rank,
    oldRating: c.rating,
    newRating: Math.max(0, c.rating + c.delta),
    delta: c.delta,
  }));
}

/** Rank title + colour class (displayed next to handles). */
export function rankOf(rating) {
  if (rating == null) return { title: 'Unrated', cls: 'r-unrated' };
  const tiers = [
    [3000, 'Legendary Grandmaster', 'r-legend'],
    [2600, 'International Grandmaster', 'r-red'],
    [2400, 'Grandmaster', 'r-red'],
    [2300, 'International Master', 'r-orange'],
    [2100, 'Master', 'r-orange'],
    [1900, 'Candidate Master', 'r-violet'],
    [1600, 'Expert', 'r-blue'],
    [1400, 'Specialist', 'r-cyan'],
    [1200, 'Pupil', 'r-green'],
    [-Infinity, 'Newbie', 'r-gray'],
  ];
  const [, title, cls] = tiers.find(([min]) => rating >= min);
  return { title, cls };
}
