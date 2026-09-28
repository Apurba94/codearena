import { db } from '../db.js';
import { forbidden, notFound } from '../util/http.js';
import { isStaff, lockedByContest, phaseOf } from './contests.js';
import { samples } from './tests.js';

export const problemTags = (problemId) =>
  db.all('SELECT tag FROM problem_tags WHERE problem_id = ? ORDER BY tag', problemId).map((r) => r.tag);

export function setProblemTags(problemId, tags) {
  db.run('DELETE FROM problem_tags WHERE problem_id = ?', problemId);
  for (const t of tags) db.run('INSERT OR IGNORE INTO problem_tags (problem_id, tag) VALUES (?, ?)', problemId, t);
}

/** SQL fragment: problem is visible in the public problemset right now. */
export const PUBLIC_PROBLEM_SQL = `p.visibility = 'public' AND NOT EXISTS (
  SELECT 1 FROM contest_problems cp JOIN contests c ON c.id = cp.contest_id
   WHERE cp.problem_id = p.id AND c.start_at + c.duration_min * 60000 > ?)`;

/**
 * Resolve a problem the viewer may open.
 * Via a contest: allowed once the contest has started (staff: always).
 * Otherwise: must be public and not part of an unfinished contest (staff: always).
 */
export function accessibleProblem(code, user, contestId = null) {
  const p = db.get('SELECT * FROM problems WHERE code = ?', code);
  if (!p) throw notFound('Problem');
  const staff = isStaff(user);
  let contest = null;
  let label = null;
  if (contestId) {
    contest = db.get('SELECT * FROM contests WHERE id = ?', contestId);
    const link = contest && db.get('SELECT label FROM contest_problems WHERE contest_id = ? AND problem_id = ?', contest.id, p.id);
    if (!link) throw notFound('Problem');
    label = link.label;
    if (!staff) {
      if (contest.visibility !== 'public') throw notFound('Problem');
      if (phaseOf(contest) === 'upcoming') throw forbidden('The contest has not started yet');
    }
  } else if (!staff && (p.visibility !== 'public' || lockedByContest(p.id))) {
    throw notFound('Problem');
  }
  return { problem: p, contest, label };
}

export function problemView(p, { withStats = true } = {}) {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    legend: p.legend,
    inputSpec: p.input_spec,
    outputSpec: p.output_spec,
    notes: p.notes,
    timeLimitMs: p.time_limit_ms,
    memoryLimitMb: p.memory_limit_mb,
    checker: p.checker,
    difficulty: p.difficulty,
    source: p.source,
    visibility: p.visibility,
    tags: problemTags(p.id),
    samples: samples(p.id).map(({ input, output }) => ({ input, output })),
    ...(withStats ? { solvedCount: p.solved_count, submissionCount: p.submission_count, acceptedCount: p.accepted_count } : {}),
  };
}
