// Phrases that address a model rather than a reader. A match doesn't block anything: it points the
// reviewing manager at a passage, since hidden text (white on white, tiny fonts) is invisible in the
// PDF itself but extracted and sent to the model like any other text.

// "ignore previous instructions", "disregard the rules", "forget all prior prompts", ...: checked
// word by word rather than as one regex, which would need nested optional groups and backtrack
const OVERRIDE_VERBS = new Set(['ignore', 'disregard', 'forget', 'override']);
const FILLER_WORDS = new Set([
  'all',
  'any',
  'the',
  'your',
  'previous',
  'prior',
  'above',
  'earlier',
  'preceding',
  'existing',
]);
const RULE_WORDS = new Set([
  'instructions',
  'rules',
  'prompt',
  'prompts',
  'guidelines',
]);
const MAX_FILLERS = 2;

// The text is whitespace-normalised first, so single spaces suffice and nothing backtracks
const INSTRUCTION_PATTERNS: RegExp[] = [
  /\byou are now\b/gi,
  /\b(?:new|updated) instructions?:/gi,
  /\bsystem prompt\b/gi,
  /\b(?:act|behave) as (?:an? )?(?:ai|assistant|model|chatbot)\b/gi,
  /\b(?:do not|don't|never) (?:tell|mention|reveal|disclose) (?:this|these|the user|anyone)\b/gi,
  // Text that would close or open one of the prompt's data tags
  /<\/? ?(?:playbook|entries|system|instructions?|quotation_data|client_data) ?>/gi,
];

const MAX_FLAGS_PER_CHUNK = 5;

/** Distinct instruction-like phrases found in the text, as written, at most 5. */
export function instructionLikePhrases(text: string): string[] {
  const normalised = text.replace(/\s+/g, ' ');
  const found = new Set<string>();
  for (const phrase of overridePhrases(normalised)) {
    found.add(phrase);
    if (found.size >= MAX_FLAGS_PER_CHUNK) return [...found];
  }
  for (const pattern of INSTRUCTION_PATTERNS) {
    for (const match of normalised.matchAll(pattern)) {
      found.add(match[0]);
      if (found.size >= MAX_FLAGS_PER_CHUNK) return [...found];
    }
  }
  return [...found];
}

/** An override verb, up to two filler words, then a word for rules: "Ignore all previous instructions". */
function overridePhrases(text: string): string[] {
  const words = text.split(' ');
  const bare = words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ''));
  const phrases: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (!OVERRIDE_VERBS.has(bare[i])) continue;
    for (let j = i + 1; j <= i + 1 + MAX_FILLERS && j < words.length; j++) {
      if (RULE_WORDS.has(bare[j])) {
        phrases.push(
          words
            .slice(i, j + 1)
            .join(' ')
            .replace(/\W+$/, ''),
        );
        break;
      }
      if (!FILLER_WORDS.has(bare[j])) break;
    }
  }
  return phrases;
}
