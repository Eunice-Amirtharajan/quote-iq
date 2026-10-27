/**
 * Which Groq models each role may use. Models are pinned, not discovered: a provider catalog change
 * once switched production to a reasoning model (2-3x the tokens) and retired the classifier's
 * model, taking Q&A down. Changing a pin is a deliberate config change, checked by the eval.
 */
export type ModelRole = 'completion' | 'classifier';
export type ModelPins = Record<ModelRole, string[]>;

export const DEFAULT_MODEL_PINS: ModelPins = {
  // Fallback chain order: tried one at a time on a transient error or a retired model
  completion: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'],
  // Must answer Y/N in 1 token, so no reasoning models (gpt-oss returns an empty string)
  classifier: ['qwen/qwen3.8-27b', 'allam-2-7b'],
};

const PIN_ENV: Record<ModelRole, string> = {
  completion: 'GROQ_COMPLETION_MODELS',
  classifier: 'GROQ_CLASSIFIER_MODELS',
};

// Groq lists speech (whisper, orpheus, tts), embedding and safety-classifier models
// (prompt-guard, safeguard) next to chat models; none of them can answer a prompt
const NON_CHAT_MODEL_MARKERS = ['whisper', 'embed', 'tts', 'orpheus', 'guard'];

/** Pins from env (comma-separated, in order), else the defaults. */
export function modelPinsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ModelPins {
  const read = (role: ModelRole) => {
    const ids = (env[PIN_ENV[role]] ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return ids.length > 0 ? ids : DEFAULT_MODEL_PINS[role];
  };
  return { completion: read('completion'), classifier: read('classifier') };
}

export interface CatalogStatus {
  /** Pinned models the provider doesn't offer, per role */
  missing: ModelPins;
  /** No pinned completion model was available, so completions use discovered models */
  completionFallback: boolean;
}

export function isChatModel(id: string): boolean {
  return !NON_CHAT_MODEL_MARKERS.some((marker) => id.includes(marker));
}

export class ModelCatalog {
  private resolved: ModelPins = { completion: [], classifier: [] };

  constructor(readonly pins: ModelPins) {}

  /** Resolves each role's models against what the provider offers right now. */
  load(providerModelIds: string[]): CatalogStatus {
    const offered = new Set(providerModelIds.filter(isChatModel));
    const pick = (role: ModelRole) =>
      this.pins[role].filter((id) => offered.has(id));
    this.resolved = {
      completion: pick('completion'),
      classifier: pick('classifier'),
    };

    const completionFallback =
      this.resolved.completion.length === 0 && offered.size > 0;
    if (completionFallback) {
      // Degraded, not down: better an unpinned model than no AI features at all
      this.resolved.completion = rankBySize([...offered]);
    }
    const missingFor = (role: ModelRole) =>
      this.pins[role].filter((id) => !offered.has(id));
    return {
      missing: {
        completion: missingFor('completion'),
        classifier: missingFor('classifier'),
      },
      completionFallback,
    };
  }

  /** Models to try for a role, in order. */
  models(role: ModelRole): string[] {
    return [...this.resolved[role]];
  }

  /** Drops a model the provider has retired since startup, so later calls skip it. */
  retire(modelId: string): void {
    this.resolved = {
      completion: this.resolved.completion.filter((id) => id !== modelId),
      classifier: this.resolved.classifier.filter((id) => id !== modelId),
    };
  }
}

/** Discovery fallback only: largest parameter count first, parsed from the id ("120b"). */
function rankBySize(ids: string[]): string[] {
  return ids.sort((a, b) => parameterBillions(b) - parameterBillions(a));
}

/** "openai/gpt-oss-120b" -> 120, "qwen/qwen3.8-27b" -> 27; 0 when the id has no size part. */
export function parameterBillions(id: string): number {
  for (const part of id.toLowerCase().split(/[-/_]/)) {
    const digits = part.slice(0, -1);
    const isSize =
      part.endsWith('b') &&
      digits.length > 0 &&
      [...digits].every((c) => c >= '0' && c <= '9');
    if (isSize) return Number(digits);
  }
  return 0;
}
