-- Grade SQLite schema. All user-facing data is scoped by family_id.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS family_profiles (
  family_id TEXT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS family_settings (
  family_id TEXT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
  class_count INTEGER CHECK (class_count IS NULL OR class_count >= 1),
  grade_count INTEGER CHECK (grade_count IS NULL OR grade_count >= 1),
  grade_target INTEGER CHECK (grade_target IS NULL OR grade_target >= 1),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);

CREATE TABLE IF NOT EXISTS subject_targets (
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  target_rate REAL NOT NULL CHECK (target_rate >= 0 AND target_rate <= 100),
  PRIMARY KEY (family_id, subject_id)
);

CREATE TABLE IF NOT EXISTS score_maxima (
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  template TEXT NOT NULL CHECK (template IN ('mock', 'regular')),
  subject_id TEXT NOT NULL,
  max_score REAL CHECK (max_score IS NULL OR max_score > 0),
  PRIMARY KEY (family_id, template, subject_id)
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  class_rank INTEGER CHECK (class_rank IS NULL OR class_rank >= 1),
  grade_rank INTEGER CHECK (grade_rank IS NULL OR grade_rank >= 1),
  class_count INTEGER CHECK (class_count IS NULL OR class_count >= 1),
  grade_count INTEGER CHECK (grade_count IS NULL OR grade_count >= 1),
  note TEXT NOT NULL DEFAULT '',
  org_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_family_date ON exams(family_id, exam_date, created_at);

CREATE TABLE IF NOT EXISTS exam_subjects (
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  score REAL,
  max_score REAL,
  status TEXT,
  PRIMARY KEY (exam_id, subject_id),
  CHECK (
    (score IS NOT NULL AND max_score IS NOT NULL AND status IS NULL AND score >= 0 AND max_score > 0 AND score <= max_score)
    OR
    (score IS NULL AND max_score IS NULL AND status IS NOT NULL AND status IN ('untested', 'pending', 'absent'))
  )
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  skill TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL,
  question_key TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (score >= 0 AND max_score > 0 AND score <= max_score),
  UNIQUE (exam_id, subject_id, question_key)
);
CREATE INDEX IF NOT EXISTS idx_evidence_family_subject ON evidence(family_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_evidence_exam ON evidence(exam_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,
  result_correct INTEGER,
  result_total INTEGER,
  result_question_set TEXT,
  result_date TEXT,
  result_hints INTEGER CHECK (result_hints IS NULL OR result_hints IN (0, 1)),
  result_note TEXT NOT NULL DEFAULT '',
  result_recorded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (result_correct IS NULL AND result_total IS NULL)
    OR
    (result_correct IS NOT NULL AND result_total IS NOT NULL AND result_correct >= 0 AND result_total >= 1 AND result_correct <= result_total)
  )
);
CREATE INDEX IF NOT EXISTS idx_tasks_family ON tasks(family_id, due_date);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('exam.create', 'exam.update', 'exam.delete')),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_family ON audit_logs(family_id, created_at);

INSERT INTO schema_meta(key, value) VALUES ('version', '3') ON CONFLICT(key) DO NOTHING;
