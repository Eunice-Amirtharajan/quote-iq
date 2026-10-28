import { Pseudonyms } from './pseudonyms';

describe('Pseudonyms', () => {
  const names = new Pseudonyms({
    CLIENT_A: 'Bauer Logistics GmbH',
    SALES_REP_A: 'Anna Schmidt',
  });

  it('replaces every known name, ignoring case', () => {
    expect(
      names.hide(
        'Client: Bauer Logistics GmbH. Notes: call BAUER LOGISTICS GMBH via Anna Schmidt.',
      ),
    ).toBe('Client: CLIENT_A. Notes: call CLIENT_A via SALES_REP_A.');
  });

  it('puts the real names back in the model output', () => {
    expect(
      names.reveal(
        'CLIENT_A has approved 3 of 4 deals; Client_A trusts SALES_REP_A.',
      ),
    ).toBe(
      'Bauer Logistics GmbH has approved 3 of 4 deals; Bauer Logistics GmbH trusts Anna Schmidt.',
    );
  });

  it('round-trips text unchanged', () => {
    const text = 'Bauer Logistics GmbH asked Anna Schmidt for 10% off.';
    expect(names.reveal(names.hide(text))).toBe(text);
  });

  it('also hides the XML-escaped spelling and restores the plain one', () => {
    const p = new Pseudonyms({ CLIENT_A: 'Smith & Co' });
    expect(p.hide('Client: Smith &amp; Co')).toBe('Client: CLIENT_A');
    expect(p.reveal('CLIENT_A is new')).toBe('Smith & Co is new');
  });

  it('replaces a longer name whole when it contains a shorter one', () => {
    const p = new Pseudonyms({ CLIENT_A: 'Anna', SALES_REP_A: 'Anna Schmidt' });
    expect(p.hide('Anna Schmidt sells to Anna')).toBe(
      'SALES_REP_A sells to CLIENT_A',
    );
  });

  it('skips missing and very short names, which would match inside words', () => {
    const p = new Pseudonyms({ CLIENT_A: 'AB', SALES_REP_A: undefined });
    expect(p.hide('ABC Labs and AB')).toBe('ABC Labs and AB');
  });

  it('matches exactly when lower-casing would change the text length', () => {
    const p = new Pseudonyms({ CLIENT_A: 'İstanbul Kargo' });
    expect(p.hide('Client: İstanbul Kargo')).toBe('Client: CLIENT_A');
  });
});
