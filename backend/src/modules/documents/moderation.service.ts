import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async moderate(text: string): Promise<ModerationResult> {
    if (!text) return { flagged: false, categories: [] };

    try {
      const response = await this.openai.moderations.create({ input: text });
      const result = response.results[0];
      if (!result) return { flagged: false, categories: [] };

      const flaggedCategories = (
        Object.entries(result.categories) as [string, boolean][]
      )
        .filter(([, v]) => v)
        .map(([k]) => k);

      if (result.flagged) {
        this.logger.warn({ categories: flaggedCategories }, 'Content moderation flagged document');
      }

      return { flagged: result.flagged, categories: flaggedCategories };
    } catch (err) {
      this.logger.error({ err }, 'OpenAI moderation call failed — allowing document through');
      return { flagged: false, categories: [] };
    }
  }
}
