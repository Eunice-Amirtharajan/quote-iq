-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to DocumentChunk
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- IVFFlat index for fast approximate nearest-neighbour search
-- lists=100 is appropriate for tens of thousands of chunks
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
  ON "DocumentChunk" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
