import {
  DEFAULT_MODEL_PINS,
  isChatModel,
  ModelCatalog,
  modelPinsFromEnv,
  parameterBillions,
} from './model-catalog';

// The list Groq returned for this key on 2026-10-27
const GROQ_CATALOG = [
  'canopylabs/orpheus-arabic-saudi',
  'openai/gpt-oss-safeguard-20b',
  'meta-llama/llama-prompt-guard-2-22m',
  'meta-llama/llama-prompt-guard-2-86m',
  'openai/gpt-oss-20b',
  'canopylabs/orpheus-v1-english',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'allam-2-7b',
];

describe('ModelCatalog', () => {
  it('resolves the default pins against the real Groq catalog, in pinned order', () => {
    const catalog = new ModelCatalog(DEFAULT_MODEL_PINS);
    const status = catalog.load(GROQ_CATALOG);
    expect(catalog.models('completion')).toEqual([
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-20b',
    ]);
    expect(catalog.models('classifier')).toEqual([
      'qwen/qwen3.8-27b',
      'allam-2-7b',
    ]);
    expect(status).toEqual({
      missing: { completion: [], classifier: [] },
      completionFallback: false,
    });
  });

  it('never resolves a reasoning model as the classifier by default', () => {
    expect(
      DEFAULT_MODEL_PINS.classifier.some((m) => m.includes('gpt-oss')),
    ).toBe(false);
  });

  it('reports pinned models the provider no longer offers', () => {
    const catalog = new ModelCatalog({
      completion: ['retired-70b', 'qwen/qwen3.8-27b'],
      classifier: ['llama-3.1-8b-instant'],
    });
    const status = catalog.load(GROQ_CATALOG);
    expect(status.missing).toEqual({
      completion: ['retired-70b'],
      classifier: ['llama-3.1-8b-instant'],
    });
    expect(catalog.models('completion')).toEqual(['qwen/qwen3.8-27b']);
    expect(catalog.models('classifier')).toEqual([]);
  });

  it('falls back to discovered chat models, largest first, when no completion pin is offered', () => {
    const catalog = new ModelCatalog({ completion: ['gone'], classifier: [] });
    const status = catalog.load(GROQ_CATALOG);
    expect(status.completionFallback).toBe(true);
    expect(catalog.models('completion')).toEqual([
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-20b',
      'allam-2-7b',
    ]);
  });

  it('has no models and no fallback when the provider offers nothing usable', () => {
    const catalog = new ModelCatalog(DEFAULT_MODEL_PINS);
    const status = catalog.load(['whisper-large-v3']);
    expect(status.completionFallback).toBe(false);
    expect(catalog.models('completion')).toEqual([]);
  });

  it('drops a retired model from every role', () => {
    const catalog = new ModelCatalog(DEFAULT_MODEL_PINS);
    catalog.load(GROQ_CATALOG);
    catalog.retire('qwen/qwen3.8-27b');
    expect(catalog.models('completion')).not.toContain('qwen/qwen3.8-27b');
    expect(catalog.models('classifier')).toEqual(['allam-2-7b']);
  });

  it('returns copies, so callers cannot change the catalog', () => {
    const catalog = new ModelCatalog(DEFAULT_MODEL_PINS);
    catalog.load(GROQ_CATALOG);
    catalog.models('completion').pop();
    expect(catalog.models('completion')).toHaveLength(3);
  });
});

describe('isChatModel', () => {
  it.each([
    'whisper-large-v3',
    'canopylabs/orpheus-v1-english',
    'playai-tts',
    'meta-llama/llama-prompt-guard-2-86m',
    'openai/gpt-oss-safeguard-20b',
    'nomic-embed-text',
  ])('rejects %s', (id) => expect(isChatModel(id)).toBe(false));

  it.each(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'allam-2-7b'])(
    'accepts %s',
    (id) => expect(isChatModel(id)).toBe(true),
  );
});

describe('parameterBillions', () => {
  it.each([
    ['openai/gpt-oss-120b', 120],
    ['qwen/qwen3.8-27b', 27],
    ['allam-2-7b', 7],
    ['llama-3.1-70b-versatile', 70],
    ['llama3-8b-8192', 8],
    ['GEMMA_9B_IT', 9],
    ['canopylabs/orpheus-v1-english', 0],
    ['mixtral-8x7b-32768', 0],
  ])('%s -> %d', (id, expected) => {
    expect(parameterBillions(id)).toBe(expected);
  });
});

describe('modelPinsFromEnv', () => {
  it('uses the defaults when nothing is set', () => {
    expect(modelPinsFromEnv({})).toEqual(DEFAULT_MODEL_PINS);
  });

  it('reads comma-separated pins in order, ignoring spaces and empty entries', () => {
    expect(
      modelPinsFromEnv({
        GROQ_COMPLETION_MODELS: ' a , b,, c ',
        GROQ_CLASSIFIER_MODELS: 'x',
      }),
    ).toEqual({ completion: ['a', 'b', 'c'], classifier: ['x'] });
  });

  it('falls back to the defaults for an empty value', () => {
    expect(
      modelPinsFromEnv({ GROQ_CLASSIFIER_MODELS: ' , ' }).classifier,
    ).toEqual(DEFAULT_MODEL_PINS.classifier);
  });
});
