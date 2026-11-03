-- Stored full-text vector for the playbook's keyword search, so it can be indexed and ranked
-- (it was computed with to_tsvector on every query and returned unranked). Same pattern as
-- PlaybookChunk.content_tsv and QuotationEmbedding.search_tsv. Not modelled in schema.prisma.
ALTER TABLE "DocumentChunk"
  ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX "DocumentChunk_content_tsv_idx" ON "DocumentChunk" USING GIN ("content_tsv");
