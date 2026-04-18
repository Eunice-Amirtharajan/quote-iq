import { Injectable, OnModuleInit } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { z } from 'zod';
import { Recommendation } from './ai-insight.entity';

const QuotationSummarySchema = z.object({
  summary: z.string(),
  recommendation: z.enum(Recommendation),
  keyPoints: z.array(z.string()),
  riskFactors: z.array(z.string()),
});

export type QuotationSummary = z.infer<typeof QuotationSummarySchema>;

@Injectable()
export class AIService implements OnModuleInit {
  private readonly genAI: GoogleGenerativeAI;
  private modelName: string = 'gemini-1.5-flash';
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
  }
  async onModuleInit() {
    await this.resolveModel();
  }

  private async resolveModel(): Promise<void> {
    const preferredModels = [
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-pro',
    ];

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
      );
      const data = (await response.json()) as {
        models: { name: string; supportedGenerationMethods: string[] }[];
      };

      const availableNames = data.models
        .filter((m) => m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''));

      this.logger.info(
        `Available Gemini models: ${availableNames.join(', ')}`,
        AIService.name,
      );

      const resolved = preferredModels.find((m) => availableNames.includes(m));

      if (resolved) {
        this.modelName = resolved;
        this.logger.info(
          `Using Gemini model: ${this.modelName}`,
          AIService.name,
        );
      } else if (availableNames.length > 0) {
        this.modelName = availableNames[0];
        this.logger.info(`Falling back to: ${this.modelName}`, AIService.name);
      } else {
        this.logger.warn('No available Gemini models found', AIService.name);
      }
    } catch (error) {
      this.logger.warn(
        `Could not resolve Gemini model — using default: ${this.modelName}. Error: ${error instanceof Error ? error.message : String(error)}`,
        AIService.name,
      );
    }
  }

  async generateQuotationSummary(
    quotationId: string,
  ): Promise<QuotationSummary> {
    this.logger.info(
      `Generating quotation summary for: ${quotationId}`,
      AIService.name,
    );

    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { items: true, client: true, createdBy: true },
    });

    if (!quotation) {
      this.logger.warn(`Quotation not found: ${quotationId}`, AIService.name);
      throw new Error(`Quotation ${quotationId} not found`);
    }

    // Get client history
    const clientHistory = await this.prisma.quotation.findMany({
      where: { clientId: quotation.clientId, id: { not: quotationId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const approvedCount = clientHistory.filter(
      (q) => q.status === 'APPROVED',
    ).length;
    const rejectedCount = clientHistory.filter(
      (q) => q.status === 'REJECTED',
    ).length;
    const avgDealSize =
      clientHistory.length > 0
        ? clientHistory.reduce((sum, q) => sum + q.total, 0) /
          clientHistory.length
        : 0;

    const prompt = `
You are a sales intelligence assistant. Analyse this quotation and provide a structured assessment.

QUOTATION:
- Number: ${quotation.quotationNumber}
- Title: ${quotation.title}
- Status: ${quotation.status}
- Total: €${quotation.total.toLocaleString()}
- Tax Rate: ${quotation.taxRate}%
- Created: ${quotation.createdAt.toISOString().split('T')[0]}
${quotation.validUntil ? `- Valid Until: ${quotation.validUntil.toISOString().split('T')[0]}` : ''}
${quotation.notes ? `- Notes: ${quotation.notes}` : ''}

LINE ITEMS:
${quotation.items.map((i) => `- ${i.description}: ${i.quantity} x €${i.unitPrice} = €${i.lineTotal}`).join('\n')}

CLIENT: ${quotation.client.name} at ${quotation.client.company}
SALES REP: ${quotation.createdBy.name}

CLIENT HISTORY (last 5 quotations):
- Total previous quotations: ${clientHistory.length}
- Approved: ${approvedCount}
- Rejected: ${rejectedCount}
- Average deal size: €${Math.round(avgDealSize).toLocaleString()}
- This deal vs average: ${quotation.total > avgDealSize ? `${Math.round(((quotation.total - avgDealSize) / avgDealSize) * 100)}% above average` : avgDealSize > 0 ? `${Math.round(((avgDealSize - quotation.total) / avgDealSize) * 100)}% below average` : 'First deal'}

Respond ONLY with a JSON object, no markdown, no explanation:
{
  "summary": "2-3 sentence assessment of this deal",
  "recommendation": "PROCEED" | "FOLLOW_UP" | "RECONSIDER",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "riskFactors": ["risk 1"] 
}

recommendation guide:
- PROCEED: strong client history, reasonable deal size, good signals
- FOLLOW_UP: mixed signals, needs attention
- RECONSIDER: high risk, poor history, overpriced
    `.trim();

    try {
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      this.logger.info(
        `Gemini response received for quotation: ${quotationId}`,
        AIService.name,
      );

      const parsed = JSON.parse(text) as unknown;
      const validated = QuotationSummarySchema.parse(parsed);

      this.logger.info(
        `Summary generated — recommendation: ${validated.recommendation}`,
        AIService.name,
      );

      return validated;
    } catch (error) {
      this.logger.error(
        `Failed to generate summary for quotation: ${quotationId}`,
        error instanceof Error ? error.stack : String(error),
        AIService.name,
      );
      throw error;
    }
  }
}
