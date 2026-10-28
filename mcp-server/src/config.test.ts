import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('accepts a token, defaulting to the local API', () => {
    assert.equal(
      loadConfig({ QUOTEIQ_TOKEN: 'jwt' }).QUOTEIQ_API_URL,
      'http://localhost:4000/graphql',
    );
  });

  it('accepts an email and password instead of a token', () => {
    const config = loadConfig({
      QUOTEIQ_EMAIL: 'marcus@quoteiq.com',
      QUOTEIQ_PASSWORD: 'secret',
    });
    assert.equal(config.QUOTEIQ_EMAIL, 'marcus@quoteiq.com');
  });

  it('requires a token or both email and password', () => {
    assert.throws(
      () => loadConfig({ QUOTEIQ_EMAIL: 'marcus@quoteiq.com' }),
      /Set QUOTEIQ_TOKEN, or both QUOTEIQ_EMAIL and QUOTEIQ_PASSWORD/,
    );
  });

  it('refuses to send credentials over plain http to a remote host', () => {
    assert.throws(
      () =>
        loadConfig({
          QUOTEIQ_TOKEN: 'jwt',
          QUOTEIQ_API_URL: 'http://api.quoteiq.example/graphql',
        }),
      /must use https unless it points at localhost/,
    );
    assert.doesNotThrow(() =>
      loadConfig({
        QUOTEIQ_TOKEN: 'jwt',
        QUOTEIQ_API_URL: 'https://api.quoteiq.example/graphql',
      }),
    );
  });

  it('lists invalid values by name', () => {
    assert.throws(
      () => loadConfig({ QUOTEIQ_TOKEN: 'jwt', QUOTEIQ_API_URL: 'not a url' }),
      /QUOTEIQ_API_URL:/,
    );
  });
});
