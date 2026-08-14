-- CreateTable
CREATE TABLE "PlaybookChunk" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaybookChunk_source_idx" ON "PlaybookChunk"("source");

-- CreateIndex (HNSW for cosine similarity search)
CREATE INDEX "PlaybookChunk_embedding_idx"
  ON "PlaybookChunk"
  USING hnsw (embedding vector_cosine_ops);
