import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TelemetrySdk } from '../src/conversion.js';

async function loadGeneratedPixel() {
  const wasmBytes = await readFile(new URL('../pkg/pixel.wasm', import.meta.url));
  const generated = await import('../pkg/funnel_wasm.js');
  await generated.default({ module_or_path: new Uint8Array(wasmBytes) });
  return { calculate_funnel_score: generated.calculate_funnel_score };
}

function decodeEnvelope(headers: Record<string, string>): Record<string, unknown> {
  return JSON.parse(Buffer.from(headers['X-GA-Session-Properties'], 'base64url').toString('utf8'));
}

test('real Wasm produces deterministic cv2 three-header transport from the browser sequence', async () => {
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
    const sdk = new TelemetrySdk({
      measurementId: 'G-TEST-123',
      conversion: { scorePrefix: missing.scorePrefix },
    });

    // Prime the per-runtime call counter; the next two calls use fixtures 1 and 2.
    await sdk.getConversionHeaders(missing.journey, {});
    const first = await sdk.getConversionHeaders(missing.journey, {});
    const second = await sdk.getConversionHeaders(next.journey, {});

    assert.equal(first['X-GA-Measurement-Id'], 'G-TEST-123');
    assert.equal(first['X-GA-Session-Id'], missing.pulse);
    const firstEnvelope = decodeEnvelope(first);
    const secondEnvelope = decodeEnvelope(second);
    assert.deepEqual(firstEnvelope, {
      client: 'v2.10.4-pixel',
      eid: missing.clickId,
      props: missing.inputProperties,
      sum: missing.score,
      v: 'cv2',
    });
    assert.equal(secondEnvelope['eid'], next.clickId);
    assert.equal(secondEnvelope['sum'], next.score);
    assert.equal(second['X-GA-Session-Id'], first['X-GA-Session-Id']);
    assert.notEqual(secondEnvelope['eid'], firstEnvelope['eid']);
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

test('real Wasm rejects an invalid prefix before reading browser sources', async () => {
  const raw = await loadGeneratedPixel();
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalPerformanceNow = globalThis.performance.now;
  let clockCalls = 0;
  let randomCalls = 0;
  let performanceCalls = 0;
  try {
    Date.now = () => {
      clockCalls += 1;
      return 1699999920000;
    };
    Math.random = () => {
      randomCalls += 1;
      return 0;
    };
    Object.defineProperty(globalThis.performance, 'now', {
      configurable: true,
      value: () => {
        performanceCalls += 1;
        return 0;
      },
    });

    for (const scorePrefix of ['0000', '0x']) {
      assert.throws(
        () => raw.calculate_funnel_score('/api/auth/login', 'not-json', scorePrefix),
        /unsupported conversion settings/,
      );
    }
    assert.equal(clockCalls, 0);
    assert.equal(randomCalls, 0);
    assert.equal(performanceCalls, 0);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    Object.defineProperty(globalThis.performance, 'now', {
      configurable: true,
      value: originalPerformanceNow,
    });
  }
});
