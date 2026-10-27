import { buildSchema, parse, validate } from 'graphql';
import { queryLimits } from './query-limits';

const schema = buildSchema(`
  type Node { id: ID, child: Node }
  type Query { node: Node }
`);

const errors = (query: string, maxDepth = 3, maxFields = 5) =>
  validate(schema, parse(query), [queryLimits({ maxDepth, maxFields })]).map(
    (e) => e.message,
  );

describe('queryLimits', () => {
  it('accepts an operation within both limits', () => {
    expect(errors('query Ok { node { id child { id } } }')).toEqual([]);
  });

  it('rejects an operation nested deeper than the limit', () => {
    expect(
      errors('query Deep { node { child { child { child { id } } } } }'),
    ).toEqual(['Deep is nested 5 levels deep; the limit is 3']);
  });

  it('counts aliases as fields, so one request cannot repeat a field many times', () => {
    const aliases = Array.from({ length: 6 }, (_, i) => `a${i}: node { id }`);
    expect(errors(`query Many { ${aliases.join(' ')} }`, 3, 10)).toEqual([
      'Many selects 12 fields; the limit is 10',
    ]);
  });

  it('expands named and inline fragments', () => {
    const query = `
      query Frag { node { ...Deeper } }
      fragment Deeper on Node { child { ... on Node { child { child { id } } } } }
    `;
    expect(errors(query)).toEqual([
      'Frag is nested 5 levels deep; the limit is 3',
    ]);
  });

  it('does not count introspection fields', () => {
    expect(
      errors(
        '{ __schema { types { fields { type { ofType { ofType { name } } } } } } }',
      ),
    ).toEqual([]);
  });

  it('names an anonymous operation in the message', () => {
    expect(errors('{ node { child { child { child { id } } } } }')).toEqual([
      'anonymous operation is nested 5 levels deep; the limit is 3',
    ]);
  });

  it('terminates on a fragment cycle (graphql reports the cycle itself)', () => {
    const query = `
      query Cycle { node { ...A } }
      fragment A on Node { child { ...B } }
      fragment B on Node { child { ...A } }
    `;
    expect(() => errors(query, 50, 500)).not.toThrow();
  });

  it('ignores a spread of an unknown fragment (reported by graphql itself)', () => {
    expect(errors('query Missing { node { ...Nope } }')).toEqual([]);
  });
});
