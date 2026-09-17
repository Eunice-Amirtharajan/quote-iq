/**
 * Seed demo playbook documents with pre-computed embeddings.
 *
 * Inserts 4 sample markdown documents as READY Documents + DocumentChunks
 * with real OpenAI embeddings so the Playbook chat works in the demo without
 * anyone uploading anything.
 *
 * Usage:
 *   npx tsx src/prisma/seed-documents.ts
 *
 * Safe to re-run: existing rows for the same storageKey are skipped.
 * Requires OPENAI_API_KEY and DATABASE_URL in .env.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient, DocumentStatus } from '@prisma/client';
import OpenAI from 'openai';
import * as path from 'node:path';
import * as fs from 'node:fs';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

const CHUNK_WORDS = 500;
const OVERLAP_WORDS = 50;
const EMBED_MODEL = 'text-embedding-3-small';

function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + CHUNK_WORDS).join(' '));
    i += CHUNK_WORDS - OVERLAP_WORDS;
  }
  return chunks.filter((c) => c.trim().length > 0);
}

async function embedText(text: string): Promise<string> {
  const resp = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  return '[' + resp.data[0].embedding.join(',') + ']';
}

const DOCS_DIR = path.resolve(__dirname, '../../../docs/sample-playbook');

const SAMPLE_DOCS = [
  { filename: 'pricing-guidelines.pdf', file: 'pricing-guidelines.md' },
  { filename: 'discount-approval-policy.pdf', file: 'discount-approval-policy.md' },
  { filename: 'competitor-battlecard-quotewise.pdf', file: 'competitor-battlecard-quotewise.md' },
  { filename: 'win-loss-debrief-q1-2026.pdf', file: 'win-loss-debrief-q1-2026.md' },
];

async function seedDocument(
  uploaderId: string,
  filename: string,
  content: string,
) {
  const storageKey = `demo/playbook/${filename}`;

  const existing = await prisma.document.findFirst({ where: { storageKey } });
  if (existing) {
    console.log(`  skip  ${filename} — already seeded`);
    return;
  }

  const doc = await prisma.document.create({
    data: {
      filename,
      mimeType: 'application/pdf',
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      storageKey,
      storageUrl: `https://demo.quoteiq.cc/playbook/${filename}`,
      status: DocumentStatus.READY,
      uploadedById: uploaderId,
    },
  });

  const chunks = chunkText(content);
  console.log(`  embed ${filename} — ${chunks.length} chunk(s)`);

  for (let idx = 0; idx < chunks.length; idx++) {
    const vector = await embedText(chunks[idx]);
    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk" (id, "chunkIndex", content, embedding, "documentId", "createdAt")
      VALUES (gen_random_uuid(), ${idx}, ${chunks[idx]}, ${vector}::vector, ${doc.id}, NOW())
    `;
    process.stdout.write(`    chunk ${idx + 1}/${chunks.length}\r`);
  }
  console.log(`  done  ${filename}`);
}

async function main() {
  // Find the seeded manager to use as uploader
  const manager = await prisma.user.findFirst({
    where: { role: 'SALES_MANAGER' },
    orderBy: { createdAt: 'asc' },
  });
  if (!manager) {
    throw new Error(
      'No SALES_MANAGER found in DB. Run `npx tsx src/prisma/seed.ts` first.',
    );
  }

  console.log(`Seeding playbook documents as manager: ${manager.email}`);

  for (const { filename, file } of SAMPLE_DOCS) {
    const filePath = path.join(DOCS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  warn  ${file} not found at ${filePath}, skipping`);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    await seedDocument(manager.id, filename, content);
  }

  console.log('\nDone. Playbook documents are READY and embedded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
