import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/** Loads the generated artifact without a separate Wasm network request. */
async function loadGeneratedPixel() {
  const wasmBytes = await readFile(new URL('../pkg/pixel.wasm', import.meta.url));
  const generated = await import('../pkg/funnel_wasm.js');
  await generated.default({ module_or_path: new Uint8Array(wasmBytes) });
  return { calculate_funnel_score: generated.calculate_funnel_score };
}

test('real Wasm produces deterministic cv2 samples from the browser sequence', async () => {
  const fixture = JSON.parse(await readFile(
    new URL('../../../tests/fixtures/conversion-v2.json', import.meta.url),
    'utf8',
  ));
  const missing = fixture.cases.find((candidate: { name: string }) => candidate.name === 'login-production-missing');
  const next = fixture.cases.find((candidate: { name: string }) => candidate.name === 'login-production-empty');
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalFetch = globalThis.fetch;
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis.performance, 'now');

  try {
    Date.now = () => missing.now * 1000;
    Math.random = () => 0;
    Object.defineProperty(globalThis.performance, 'now', { configurable: true, value: () => 0 });
    globalThis.fetch = async () => {
      throw new Error('The embedded base64 runtime must not fetch a Wasm asset');
    };
    const raw = await loadGeneratedPixel();

    // Prime the per-runtime call counter; the next two calls use fixtures 1 and 2.
    raw.calculate_funnel_score(missing.journey, missing.canonicalPropertiesJson, missing.scorePrefix);
    const first = JSON.parse(raw.calculate_funnel_score(
      missing.journey,
      missing.canonicalPropertiesJson,
      missing.scorePrefix,
    ));
    const second = JSON.parse(raw.calculate_funnel_score(
      next.journey,
      next.canonicalPropertiesJson,
      next.scorePrefix,
    ));

    assert.equal(first.profile, 'cv2');
    assert.equal(first.clickId, missing.clickId);
    assert.equal(first.pulse, missing.pulse);
    assert.equal(first.score, missing.score);
    assert.deepEqual(first.properties, []);
    assert.equal(second.clickId, next.clickId);
    assert.equal(second.score, next.score);
    assert.equal(second.pulse, first.pulse);
    assert.notEqual(second.clickId, first.clickId);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    globalThis.fetch = originalFetch;
    if (performanceDescriptor) {
      Object.defineProperty(globalThis.performance, 'now', performanceDescriptor);
    }
  }
});
