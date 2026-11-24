-- The card of a run: its verdict (what the question asks and each model's rating, the JSON of
-- RunVerdict of the protocol) once it completed, and the helper's one-sentence summary of its
-- answer (the TL;DR). Null before, and for runs completed before them.
ALTER TABLE runs ADD COLUMN verdict TEXT;
ALTER TABLE runs ADD COLUMN tldr TEXT;
