import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const filePath = path.resolve(__dirname, '../../../docs/lessons_learned.md');
const raw = fs.readFileSync(filePath, 'utf-8');
const chunks = raw.split('\n## ').slice(1); //to drop file header

async function main() {
  await prisma.$executeRaw`DELETE FROM "PlaybookChunk"`;
  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    const title = lines[0].trim();
    const content = chunk.trim();

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
    });
    //response.data[0].embedding will result in number[] but we need to convert it to a string representation of a vector for PostgreSQL
    const vector = '[' + response.data[0].embedding.join(',') + ']';
    console.log(`Embedding chunk ${title}`);

    await prisma.$executeRaw`INSERT INTO "PlaybookChunk" (id, source, content, embedding, "createdAt")
      VALUES (gen_random_uuid(), ${title}, ${content}, ${vector}::vector, NOW())`;
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
