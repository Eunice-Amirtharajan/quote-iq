-- Provenance of LLM output on AIInsight: which model and prompt version produced it, and its token cost.
-- Nullable: rows written before this have none and are regenerated on their next read (prompt version mismatch).
ALTER TABLE "AIInsight" ADD COLUMN "model" TEXT,
ADD COLUMN "promptVersion" TEXT,
ADD COLUMN "promptTokens" INTEGER,
ADD COLUMN "completionTokens" INTEGER;
