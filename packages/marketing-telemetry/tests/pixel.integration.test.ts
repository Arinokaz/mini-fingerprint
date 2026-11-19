import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TelemetrySdk } from '../src/conversion.js';

test('real Wasm produces deterministic cv2 headers from the browser sequence', async () => {
  const fixture = JSON.parse(await readFile(
    new URL('../../../tests/fixtures/conversion-v2.json', import.meta.url),
    'utf8',
  ));
  const missing = fixture.cases.find((candidate: { name: string }) => candidate.name === 'login-production-missing');
  const next = fixture.cases.find((candidate: { name: string }) => candidate.name === 'login-production-empty');
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalFetch = globalThis.fetch;
  const originalPerformanceNow = globalThis.performance.now;

  try {
    Date.now = () => missing.now * 1000;
    Math.random = () => 0;
    Object.defineProperty(globalThis.performance, 'now', { configurable: true, value: () => 0 });
    globalThis.fetch = async () => {
      throw new Error('The embedded base64 runtime must not fetch a Wasm asset');
    };
    const sdk = new TelemetrySdk({ conversion: { scorePrefix: missing.scorePrefix } });

    // Prime the per-runtime call counter; the next two calls use fixtures 1 and 2.
    await sdk.getConversionHeaders(missing.journey, {});
    const first = await sdk.getConversionHeaders(missing.journey, {});
    const second = await sdk.getConversionHeaders(next.journey, {});

    assert.equal(first['X-GA-Measurement-Id'], 'cv2');
    assert.equal(first['X-Amplitude-Event-Id'], missing.clickId);
    assert.equal(first['X-GA-Session-Id'], missing.pulse);
    assert.equal(first['X-Amplitude-Device-Id'], missing.score);
    assert.equal(
      first['X-Amplitude-Session-Properties'],
      Buffer.from(missing.canonicalPropertiesJson, 'utf8').toString('base64url'),
    );
    assert.equal(first['X-YM-Counter-Client'], 'v2.10.4-pixel');
    assert.equal(second['X-Amplitude-Event-Id'], next.clickId);
    assert.equal(second['X-Amplitude-Device-Id'], next.score);
    assert.equal(second['X-GA-Session-Id'], first['X-GA-Session-Id']);
    assert.notEqual(second['X-Amplitude-Event-Id'], first['X-Amplitude-Event-Id']);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis.performance, 'now', {
      configurable: true,
      value: originalPerformanceNow,
    });
  }
});
