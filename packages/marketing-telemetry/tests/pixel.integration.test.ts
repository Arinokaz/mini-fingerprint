import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TelemetrySdk } from '../src/conversion.js';
import type { ConversionPayload } from '../src/types.js';

/** Loads the already generated artifact; this test never downloads a tool. */
async function loadGeneratedPixel() {
  const wasmBytes = await readFile(new URL('../pkg/pixel.wasm', import.meta.url));
  const generated = await import('../pkg/funnel_wasm.js');
  await generated.default({ module_or_path: new Uint8Array(wasmBytes) });
  return {
    calculate_funnel_score: generated.calculate_funnel_score,
  };
}

test('real Wasm reproduces the missing-DOM fixture and emits stable telemetry headers', async () => {
  const fixture = JSON.parse(await readFile(
    new URL('../../../tests/fixtures/conversion-v1.json', import.meta.url),
    'utf8',
  ));
  const testCase = fixture.cases.find((candidate: { name: string }) => candidate.name === 'login-missing-anchor');
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;

  try {
    Date.now = () => testCase.now * 1000;
    globalThis.fetch = async () => {
      throw new Error('The embedded base64 runtime must not fetch a Wasm asset');
    };
    const sdk = new TelemetrySdk();
    const headers = await sdk.getConversionHeaders(
      testCase.journey,
      Object.fromEntries(testCase.inputProperties),
    );

    assert.equal(headers['X-GA-Measurement-Id'], 'cv1');
    assert.equal(headers['X-GA-Session-Id'], testCase.pulse);
    assert.equal(headers['X-Amplitude-Device-Id'], testCase.score);
    assert.equal(
      headers['X-Amplitude-Session-Properties'],
      Buffer.from(testCase.canonicalPropertiesJson, 'utf8').toString('base64url'),
    );
    assert.equal(headers['X-YM-Counter-Client'], 'v2.10.4-pixel');

    const second = await sdk.getConversionHeaders(
      testCase.journey,
      Object.fromEntries(testCase.inputProperties),
    );
    assert.deepEqual(second, headers, 'the same environment and time must be deterministic');

    const otherPath = await sdk.getConversionHeaders(
      '/api/auth/register',
      Object.fromEntries(testCase.inputProperties),
    );
    assert.notEqual(otherPath['X-Amplitude-Device-Id'], headers['X-Amplitude-Device-Id']);

    Date.now = () => (testCase.now + 1) * 1000;
    const nextSecond = await sdk.getConversionHeaders(
      testCase.journey,
      Object.fromEntries(testCase.inputProperties),
    );
    assert.notEqual(nextSecond['X-GA-Session-Id'], headers['X-GA-Session-Id']);
    assert.notEqual(nextSecond['X-Amplitude-Device-Id'], headers['X-Amplitude-Device-Id']);

    Date.now = () => testCase.now * 1000;
    const raw = await loadGeneratedPixel();
    const payload = JSON.parse(raw.calculate_funnel_score(testCase.journey, testCase.canonicalPropertiesJson)) as ConversionPayload;
    assert.equal(payload.score, testCase.score);
    assert.equal(payload.pulse, testCase.pulse);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});
