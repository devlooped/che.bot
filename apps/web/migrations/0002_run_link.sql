-- The public link of a run (/r/<short>-<words>, run-link.ts of the protocol), claimed once the
-- helper model named the question; null before, and for runs asked before the links. The unique
-- index keeps a link to one run; `short` finds a run by the short part alone.
ALTER TABLE runs ADD COLUMN link TEXT;
ALTER TABLE runs ADD COLUMN short TEXT;
CREATE UNIQUE INDEX runs_by_link ON runs (link);
CREATE INDEX runs_by_short ON runs (short, created_at);
