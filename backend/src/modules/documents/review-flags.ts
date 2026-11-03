// Phrases that address a model rather than a reader. A match doesn't block anything: it points the
// reviewing manager at a passage, since hidden text (white on white, tiny fonts) is invisible in the
// PDF itself but extracted and sent to the model like any other text.
const INSTRUCTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier|preceding|existing)?\s*(instructions|rules|prompts?|guidelines)\b/gi,
  /\byou\s+are\s+now\b/gi,
  /\b(new|updated)\s+instructions?\s*:/gi,
  /\bsystem\s+prompt\b/gi,
  /\b(act|behave)\s+as\s+(if\s+you\s+are\s+)?(an?\s+)?(ai|assistant|model|chatbot)\b/gi,
  /\b(do\s+not|don't|never)\s+(tell|mention|reveal|disclose)\s+(this|these|the\s+user|anyone)\b/gi,
  // Text that would close or open one of the prompt's data tags
  /<\/?\s*(playbook|entries|system|instructions?|quotation_data|client_data)\s*>/gi,
];

const MAX_FLAGS_PER_CHUNK = 5;

/** Distinct instruction-like phrases found in the text, as written, at most 5. */
export function instructionLikePhrases(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of INSTRUCTION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[0].replace(/\s+/g, ' ').trim());
      if (found.size >= MAX_FLAGS_PER_CHUNK) return [...found];
    }
  }
  return [...found];
}
