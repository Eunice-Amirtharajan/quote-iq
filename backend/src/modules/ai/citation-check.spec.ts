import { checkCitedSources, citedPassages } from './citation-check';

describe('citedPassages', () => {
  it.each([
    ['Discounts over 15% need approval (see [1]).', [1]],
    ['Use the battlecard [2] and the policy [1].', [2, 1]],
    ['Both apply [1][3].', [1, 3]],
    ['Both apply [1, 3].', [1, 3]],
    ['Repeated [2] and again [2].', [2]],
  ])('finds the cited passages in %s', (answer, cited) => {
    expect(citedPassages(answer, 3)).toEqual({ cited, invalid: [] });
  });

  it('separates citations of passages that were never provided', () => {
    expect(citedPassages('See [1] and [5].', 3)).toEqual({
      cited: [1],
      invalid: [5],
    });
    expect(citedPassages('See [0].', 3)).toEqual({ cited: [], invalid: [0] });
  });

  it('ignores brackets that are not citations', () => {
    expect(
      citedPassages('Use the [Enterprise] tier, list [a, b], [ ], [1234].', 3),
    ).toEqual({ cited: [], invalid: [] });
  });

  it('handles an answer with no citation and an unclosed bracket', () => {
    expect(citedPassages('No sources here.', 3)).toEqual({
      cited: [],
      invalid: [],
    });
    expect(citedPassages('Cut off [1', 3)).toEqual({ cited: [], invalid: [] });
  });
});

describe('checkCitedSources', () => {
  const retrieved = [
    '12. Switched from Gemini to Groq',
    '31. DLQ redrive procedure',
  ];

  it('keeps sources that were retrieved, ignoring case and spacing', () => {
    expect(
      checkCitedSources(
        ['  12. switched from gemini to groq ', '31. DLQ redrive procedure'],
        retrieved,
      ),
    ).toEqual({ known: retrieved, unknown: [] });
  });

  it('reports sources the model invented', () => {
    expect(
      checkCitedSources(
        ['31. DLQ redrive procedure', '99. Something that was never retrieved'],
        retrieved,
      ),
    ).toEqual({
      known: ['31. DLQ redrive procedure'],
      unknown: ['99. Something that was never retrieved'],
    });
  });

  it('lists a source once even if cited twice', () => {
    expect(
      checkCitedSources(
        ['31. DLQ redrive procedure', '31. dlq redrive procedure'],
        retrieved,
      ).known,
    ).toEqual(['31. DLQ redrive procedure']);
  });
});
