import assert from 'node:assert/strict';
import test from 'node:test';
import { TelemetrySdk } from '../src/conversion.js';
import type { PixelRuntime } from '../src/types.js';

const score = '0123456789abcdef'.repeat(4);
const pulse = '0011223344556677';
const clickId = '0123456789abcdef'.repeat(2);
const canonicalPairs: [string, string][] = [['a.first', 'значение'], ['z.last', 'value:with:colon']];
const payload = { profile: 'cv2', clickId, pulse, score, properties: canonicalPairs };

function runtimeReturning(value: unknown, calls: string[][] = []): PixelRuntime {
  return {
    calculate_funnel_score: (...args: string[]) => {
      calls.push(args);
      return JSON.stringify(value);
    },
  };
}

function decodeProperties(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

test('facade applies the default prefix and emits the complete cv2 header set', async () => {
  const calls: string[][] = [];
  const sdk = new TelemetrySdk({}, async () => runtimeReturning(payload, calls));

  const headers = await sdk.getConversionHeaders('/api/auth/login', {
    'z.last': 'value:with:colon',
    'a.first': 'значение',
  });

  assert.deepEqual(calls, [[
    '/api/auth/login',
    JSON.stringify([['z.last', 'value:with:colon'], ['a.first', 'значение']]),
    '00',
  ]]);
  assert.equal(headers['X-GA-Measurement-Id'], 'cv2');
  assert.equal(headers['X-GA-Session-Id'], pulse);
  assert.equal(headers['X-Amplitude-Device-Id'], score);
  assert.equal(headers['X-Amplitude-Event-Id'], clickId);
  assert.equal(headers['X-YM-Counter-Client'], 'v2.10.4-pixel');
  assert.deepEqual(decodeProperties(headers['X-Amplitude-Session-Properties']), canonicalPairs);
  assert.doesNotMatch(headers['X-Amplitude-Session-Properties'], /=/);
});

test('facade forwards an explicit prefix without changing the caller settings', async () => {
  const calls: string[][] = [];
  const settings = { conversion: { scorePrefix: '000' } };
  const sdk = new TelemetrySdk(settings, async () => runtimeReturning(payload, calls));
  await sdk.getConversionHeaders('/api/auth/login');
  assert.deepEqual(calls[0], ['/api/auth/login', '[]', '000']);
  assert.deepEqual(settings, { conversion: { scorePrefix: '000' } });
});

test('invalid prefixes are rejected before runtime initialization', async () => {
  for (const scorePrefix of ['0000', '0x']) {
    let loads = 0;
    assert.throws(
      () => new TelemetrySdk({ conversion: { scorePrefix } }, async () => {
        loads += 1;
        return runtimeReturning(payload);
      }),
      /scorePrefix/,
    );
    assert.equal(loads, 0);
  }
});

test('empty properties use the canonical empty pair array', async () => {
  const sdk = new TelemetrySdk({}, async () => runtimeReturning({ ...payload, properties: [] }));
  const headers = await sdk.getConversionHeaders('/api/auth/register');
  assert.deepEqual(decodeProperties(headers['X-Amplitude-Session-Properties']), []);
});

test('facade shares initialization across concurrent submissions', async () => {
  let loads = 0;
  const sdk = new TelemetrySdk({}, async () => {
    loads += 1;
    return runtimeReturning(payload);
  });
  await Promise.all([
    sdk.getConversionHeaders('/api/auth/login'),
    sdk.getConversionHeaders('/api/auth/register'),
  ]);
  assert.equal(loads, 1);
});

test('malformed or obsolete runtime payloads are rejected', async () => {
  for (const candidate of [
    { profile: 'cv1', pulse, score, properties: [] },
    { profile: 'cv2', clickId: 'uppercase-not-hex', pulse, score, properties: [] },
    { profile: 'cv2', clickId, pulse: 'plain-time', score, properties: [] },
  ]) {
    const sdk = new TelemetrySdk({}, async () => runtimeReturning(candidate));
    await assert.rejects(sdk.getConversionHeaders('/api/auth/login'), /runtime response/);
  }
});
