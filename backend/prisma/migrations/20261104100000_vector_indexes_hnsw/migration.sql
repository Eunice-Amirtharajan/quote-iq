-- Replace the IVFFlat indexes on playbook chunks and quotation embeddings with HNSW, which the
-- lessons table (PlaybookChunk) already uses.
--
-- Both IVFFlat indexes were created in their migrations on empty tables. IVFFlat learns its
-- clusters when it is built, so built empty it is degenerate: measured on 5,000 rows it was
-- slower than an exact scan, and on unclustered data it found 9% of the true nearest neighbours.
-- Rebuilt on data it depends on ivfflat.probes (1 by default). HNSW builds incrementally, so it
-- doesn't depend on when it was created, and needs no tuning at this size.
DROP INDEX IF EXISTS "DocumentChunk_embedding_idx";
CREATE INDEX "DocumentChunk_embedding_idx"
  ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);

DROP INDEX IF EXISTS "QuotationEmbedding_embedding_idx";
CREATE INDEX "QuotationEmbedding_embedding_idx"
  ON "QuotationEmbedding" USING hnsw ("embedding" vector_cosine_ops);
