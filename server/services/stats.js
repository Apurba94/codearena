import { db } from '../db.js';

/** Recompute the (user, problem) summary plus user/problem counters after a verdict changes. */
export function refreshUserProblem(userId, problemId) {
  db.tx(() => {
    const agg = db.get(
      `SELECT COUNT(*) AS attempts,
              MIN(CASE WHEN verdict = 'AC' THEN created_at END) AS first_ac
         FROM submissions
        WHERE user_id = ? AND problem_id = ? AND status = 'done' AND verdict NOT IN ('CE', 'SE')`,
      userId, problemId,
    );
    db.run(
      `INSERT INTO user_problem (user_id, problem_id, solved, attempts, first_ac_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, problem_id) DO UPDATE SET
         solved = excluded.solved, attempts = excluded.attempts, first_ac_at = excluded.first_ac_at`,
      userId, problemId, agg.first_ac ? 1 : 0, agg.attempts, agg.first_ac ?? null,
    );
    db.run(
      'UPDATE users SET solved_count = (SELECT COUNT(*) FROM user_problem WHERE user_id = ? AND solved = 1) WHERE id = ?',
      userId, userId,
    );
    refreshProblemCounters(problemId);
  });
}

export function refreshProblemCounters(problemId) {
  db.run(
    `UPDATE problems SET
       solved_count     = (SELECT COUNT(*) FROM user_problem WHERE problem_id = ?1 AND solved = 1),
       submission_count = (SELECT COUNT(*) FROM submissions WHERE problem_id = ?1),
       accepted_count   = (SELECT COUNT(*) FROM submissions WHERE problem_id = ?1 AND verdict = 'AC')
     WHERE id = ?1`,
    problemId,
  );
}
