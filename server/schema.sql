-- CodeArena schema. All timestamps are unix epoch milliseconds (INTEGER).

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'setter', 'admin')),
  rating        INTEGER,               -- NULL = unrated
  max_rating    INTEGER,
  country       TEXT,
  organization  TEXT,
  bio           TEXT,
  cf_handle     TEXT,                  -- optional Codeforces handle for archive progress sync
  banned        INTEGER NOT NULL DEFAULT 0,
  solved_count  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users (rating DESC);
CREATE INDEX IF NOT EXISTS idx_users_solved ON users (solved_count DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS problems (
  id               INTEGER PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,           -- public identifier, e.g. "1001"
  title            TEXT NOT NULL,
  legend           TEXT NOT NULL DEFAULT '',       -- markdown + $math$
  input_spec       TEXT NOT NULL DEFAULT '',
  output_spec      TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  time_limit_ms    INTEGER NOT NULL DEFAULT 1000,
  memory_limit_mb  INTEGER NOT NULL DEFAULT 256,
  checker          TEXT NOT NULL DEFAULT 'tokens', -- tokens | lines | exact | tokens-ci | float:<eps>
  difficulty       INTEGER,
  source           TEXT,
  visibility       TEXT NOT NULL DEFAULT 'hidden' CHECK (visibility IN ('public', 'hidden')),
  author_id        INTEGER REFERENCES users (id) ON DELETE SET NULL,
  solved_count     INTEGER NOT NULL DEFAULT 0,     -- distinct users with AC
  submission_count INTEGER NOT NULL DEFAULT 0,
  accepted_count   INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_problems_vis ON problems (visibility, id);

CREATE TABLE IF NOT EXISTS problem_tags (
  problem_id INTEGER NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  PRIMARY KEY (problem_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_problem_tags_tag ON problem_tags (tag);

CREATE TABLE IF NOT EXISTS testcases (
  id          INTEGER PRIMARY KEY,
  problem_id  INTEGER NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,                    -- 1-based order
  is_sample   INTEGER NOT NULL DEFAULT 0,
  input_size  INTEGER NOT NULL DEFAULT 0,
  output_size INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  UNIQUE (problem_id, idx)
);

CREATE TABLE IF NOT EXISTS contests (
  id              INTEGER PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  start_at        INTEGER NOT NULL,
  duration_min    INTEGER NOT NULL,
  freeze_min      INTEGER NOT NULL DEFAULT 0,      -- standings freeze before end (0 = none)
  penalty_min     INTEGER NOT NULL DEFAULT 20,
  rated           INTEGER NOT NULL DEFAULT 1,
  visibility      TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')),
  ratings_applied INTEGER NOT NULL DEFAULT 0,
  created_by      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contests_start ON contests (start_at);

CREATE TABLE IF NOT EXISTS contest_problems (
  contest_id INTEGER NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  problem_id INTEGER NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
  label      TEXT NOT NULL,                        -- A, B, C ...
  PRIMARY KEY (contest_id, problem_id),
  UNIQUE (contest_id, label)
);
CREATE INDEX IF NOT EXISTS idx_contest_problems_problem ON contest_problems (problem_id);

CREATE TABLE IF NOT EXISTS contest_registrations (
  contest_id    INTEGER NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  registered_at INTEGER NOT NULL,
  PRIMARY KEY (contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS rating_changes (
  id         INTEGER PRIMARY KEY,
  contest_id INTEGER NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rank       INTEGER NOT NULL,
  old_rating INTEGER NOT NULL,
  new_rating INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (contest_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_rating_changes_user ON rating_changes (user_id, created_at);

CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  problem_id   INTEGER NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
  contest_id   INTEGER REFERENCES contests (id) ON DELETE SET NULL,  -- set only for in-contest submissions
  language     TEXT NOT NULL,
  source       TEXT NOT NULL,
  source_len   INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'compiling', 'running', 'done')),
  verdict      TEXT,                               -- AC WA TLE MLE RE CE OLE SE
  failed_test  INTEGER,
  tests_passed INTEGER NOT NULL DEFAULT 0,
  total_tests  INTEGER NOT NULL DEFAULT 0,
  time_ms      INTEGER,
  memory_kb    INTEGER,
  compile_log  TEXT,
  details      TEXT,                               -- JSON per-test results
  worker       TEXT,
  locked_at    INTEGER,
  created_at   INTEGER NOT NULL,
  judged_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions (status, id);
CREATE INDEX IF NOT EXISTS idx_sub_user ON submissions (user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_sub_problem ON submissions (problem_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_sub_contest ON submissions (contest_id, id);

-- Per (user, problem) summary maintained by the judge; drives "solved" marks and counters.
CREATE TABLE IF NOT EXISTS user_problem (
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  problem_id  INTEGER NOT NULL REFERENCES problems (id) ON DELETE CASCADE,
  solved      INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  first_ac_at INTEGER,
  PRIMARY KEY (user_id, problem_id)
);
CREATE INDEX IF NOT EXISTS idx_user_problem_problem ON user_problem (problem_id, solved);

-- Problems indexed from other online judges (metadata + link to the original statement).
CREATE TABLE IF NOT EXISTS archive_problems (
  id           INTEGER PRIMARY KEY,
  source       TEXT NOT NULL,                      -- codeforces | atcoder | uva | cses | custom
  external_id  TEXT NOT NULL,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  contest      TEXT,
  category     TEXT,
  difficulty   INTEGER,
  tags         TEXT NOT NULL DEFAULT '',           -- comma separated, lower case
  solved_count INTEGER,
  updated_at   INTEGER NOT NULL,
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_archive_source ON archive_problems (source, difficulty);
CREATE INDEX IF NOT EXISTS idx_archive_difficulty ON archive_problems (difficulty);
CREATE INDEX IF NOT EXISTS idx_archive_solved ON archive_problems (solved_count DESC);

CREATE TABLE IF NOT EXISTS archive_tags (
  archive_id INTEGER NOT NULL REFERENCES archive_problems (id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  PRIMARY KEY (archive_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_archive_tags_tag ON archive_tags (tag);

CREATE TABLE IF NOT EXISTS user_archive (
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  archive_id INTEGER NOT NULL REFERENCES archive_problems (id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('solved', 'todo')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, archive_id)
);

CREATE TABLE IF NOT EXISTS archive_sync_log (
  id          INTEGER PRIMARY KEY,
  source      TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  status      TEXT NOT NULL,                       -- running | ok | error
  imported    INTEGER NOT NULL DEFAULT 0,
  message     TEXT
);

-- Custom runs / answer generation handed to judge workers when the judge runs in its own process.
CREATE TABLE IF NOT EXISTS adhoc_jobs (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL,                        -- run | generate
  payload    TEXT NOT NULL,                        -- JSON
  status     TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done')),
  result     TEXT,                                 -- JSON { status, body }
  worker     TEXT,
  created_at INTEGER NOT NULL,
  locked_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_adhoc_status ON adhoc_jobs (status, id);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  author_id  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
