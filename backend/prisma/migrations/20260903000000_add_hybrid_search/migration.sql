CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "PlaybookChunk"
  ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX "PlaybookChunk_tsv_idx" ON "PlaybookChunk" USING GIN ("content_tsv");
CREATE INDEX "PlaybookChunk_trgm_idx" ON "PlaybookChunk" USING GIN (content gin_trgm_ops);
