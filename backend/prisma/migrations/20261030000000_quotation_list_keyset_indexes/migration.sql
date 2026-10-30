-- Indexes matching the quotations list order (createdAt DESC, id DESC) for keyset pagination.
-- Without them every page, even the first, read and sorted the whole table (measured on 50k
-- rows: 11-17 ms and ~2,500 buffers per page; with them 0.02-0.03 ms and 4-5 buffers).
-- The rep index starts with createdById, so it replaces the single-column createdById index.

-- DropIndex
DROP INDEX "Quotation_createdById_idx";

-- CreateIndex
CREATE INDEX "Quotation_createdAt_id_idx" ON "Quotation"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Quotation_createdById_createdAt_id_idx" ON "Quotation"("createdById", "createdAt" DESC, "id" DESC);
