-- A run its owner deleted stays, hidden: only its owner reads it, and may restore it (null:
-- not deleted). A run asked again from its page `replaces` the old one; once the new one starts,
-- the old one is deleted with `replaced_by` the new one, which its link then leads to.
ALTER TABLE runs ADD COLUMN deleted_at TEXT;
ALTER TABLE runs ADD COLUMN replaces TEXT;
ALTER TABLE runs ADD COLUMN replaced_by TEXT;
