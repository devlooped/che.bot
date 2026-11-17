-- Shared by all runs: the model settings (families, not versions), the price of each class, and
-- the list of runs by owner. A run itself lives in its RunObject.
CREATE TABLE model_settings (
  role TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  effort TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE prices (
  class TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  currency TEXT NOT NULL
);

INSERT INTO prices (class, amount, currency) VALUES ('simple', 5000, 'ARS'), ('complex', 10000, 'ARS');

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  created_at TEXT NOT NULL,
  question TEXT NOT NULL,
  class TEXT,
  status TEXT NOT NULL,
  amount REAL
);

CREATE INDEX runs_by_owner ON runs (owner, created_at DESC);
