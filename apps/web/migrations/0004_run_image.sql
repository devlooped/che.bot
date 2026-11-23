-- The picture of a run: the version of the one its RunObject keeps (GET /api/runs/:id/image?v=),
-- null before the image model drew it, and for runs asked before the pictures. The home page lists
-- every run that was asked, newest first.
ALTER TABLE runs ADD COLUMN image TEXT;
CREATE INDEX runs_by_date ON runs (created_at DESC, id);
