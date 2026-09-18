-- CreateTable: QuotationEmbedding
CREATE TABLE "QuotationEmbedding" (
    "id"          TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "searchText"  TEXT NOT NULL,
    "embedding"   vector(1536),
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "QuotationEmbedding_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex on quotationId (one embedding per quotation)
CREATE UNIQUE INDEX "QuotationEmbedding_quotationId_key"
    ON "QuotationEmbedding"("quotationId");

-- AddForeignKey
ALTER TABLE "QuotationEmbedding"
    ADD CONSTRAINT "QuotationEmbedding_quotationId_fkey"
    FOREIGN KEY ("quotationId")
    REFERENCES "Quotation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GIN index on generated tsvector for keyword search
ALTER TABLE "QuotationEmbedding"
    ADD COLUMN "search_tsv" tsvector
        GENERATED ALWAYS AS (to_tsvector('english', "searchText")) STORED;

CREATE INDEX "QuotationEmbedding_search_tsv_idx"
    ON "QuotationEmbedding" USING GIN ("search_tsv");

-- IVFFlat index on embedding vector for ANN search
-- lists=100 is a reasonable default for up to ~1M rows; adjust as corpus grows
CREATE INDEX "QuotationEmbedding_embedding_idx"
    ON "QuotationEmbedding" USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 100);
