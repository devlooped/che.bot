-- When the answer of a run was made: set when its verdict is listed, so asking it again (which
-- completes it once more) moves it. Null before, and for runs completed before it.
ALTER TABLE runs ADD COLUMN answered_at TEXT;
