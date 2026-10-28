import { escapeXml } from '../../common/helper/helper';

/**
 * Data minimisation for prompts: known names (the client, the sales rep) are replaced with
 * placeholders before text goes to an external model, and put back in its answer. The model
 * doesn't need a real name to analyse a deal, and the provider never receives one.
 *
 * Only exact names are replaced (ignoring case), wherever they appear: a shortened name typed
 * into free text ("Bauer" for "Bauer Logistics GmbH") still goes through.
 */
export class Pseudonyms {
  private readonly pairs: { name: string; alias: string }[] = [];
  private readonly realNames = new Map<string, string>();

  /** names: placeholder → real name, e.g. { CLIENT_A: 'Bauer Logistics GmbH' } */
  constructor(names: Record<string, string | null | undefined>) {
    for (const [alias, name] of Object.entries(names)) {
      const trimmed = name?.trim();
      // Very short names would match inside ordinary words
      if (!trimmed || trimmed.length < MIN_NAME_LENGTH) continue;
      this.pairs.push({ name: trimmed, alias });
      this.realNames.set(alias, trimmed);
      // The prompts XML-escape free text, so "Smith & Co" also appears as "Smith &amp; Co"
      const escaped = escapeXml(trimmed);
      if (escaped !== trimmed) this.pairs.push({ name: escaped, alias });
    }
    // Longest first, so a name containing another is replaced whole
    this.pairs.sort((a, b) => b.name.length - a.name.length);
  }

  /** The text with every known name replaced by its placeholder. */
  hide(text: string): string {
    return this.pairs.reduce(
      (out, { name, alias }) => replaceIgnoringCase(out, name, alias),
      text,
    );
  }

  /** The model's text with placeholders turned back into the real names. */
  reveal(text: string): string {
    let out = text;
    for (const [alias, name] of this.realNames) {
      out = replaceIgnoringCase(out, alias, name);
    }
    return out;
  }
}

const MIN_NAME_LENGTH = 3;

function replaceIgnoringCase(
  text: string,
  find: string,
  replacement: string,
): string {
  // Lower-casing can change the length of a few characters (e.g. Turkish İ), which would
  // shift the indices: match exactly in that case
  const lower = text.toLowerCase();
  const sameLength = lower.length === text.length;
  const haystack = sameLength ? lower : text;
  const needle = sameLength ? find.toLowerCase() : find;
  let out = '';
  let from = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    out += text.slice(from, at) + replacement;
    from = at + needle.length;
    at = haystack.indexOf(needle, from);
  }
  return out + text.slice(from);
}
