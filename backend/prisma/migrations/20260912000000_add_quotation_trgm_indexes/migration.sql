-- pg_trgm is already installed (added in 20260903000000_add_hybrid_search).
-- Add GIN trigram indexes on the three columns used in the ILIKE search path
-- of quotations.service.ts findAll() so that case-insensitive contains queries
-- can use an index scan instead of a sequential scan across 20k+ rows.

CREATE INDEX IF NOT EXISTS "Quotation_title_trgm_idx"
  ON "Quotation" USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Quotation_quotationNumber_trgm_idx"
  ON "Quotation" USING GIN ("quotationNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Quotation_clientName_trgm_idx"
  ON "Quotation" USING GIN ("clientName" gin_trgm_ops);
