import assert from 'node:assert/strict';
import test from 'node:test';
import { TelemetrySdk } from '../src/conversion.js';
import type { PixelRuntime } from '../src/types.js';

const score = '0123456789abcdef'.repeat(4);
const pulse = '0011223344556677';
const canonicalPairs: [string, string][] = [['a.first', 'значение'], ['z.last', 'value:with:colon']];

function runtimeReturning(payload: unknown, calls: string[][] = []): PixelRuntime {
  return {
    calculate_funnel_score: (...args: string[]) => {
      calls.push(args);
      return JSON.stringify(payload);
    },
  };
}

function decodeProperties(value: string): unknown {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - normalized.length % 4);
  return JSON.parse(Buffer.from(normalized + padding, 'base64').toString('utf8'));
}

test('facade forwards the API path and properties without a timestamp argument', async () => {
  const calls: string[][] = [];
  const runtime = runtimeReturning({ profile: 'cv1', pulse, score, properties: canonicalPairs }, calls);
  const sdk = new TelemetrySdk({ pixelUrl: '/assets/pixel.wasm' }, async () => runtime);

  const headers = await sdk.getConversionHeaders('/api/auth/login', {
    'z.last': 'value:with:colon',
    'a.first': 'значение',
  });

  assert.deepEqual(calls, [[
    '/api/auth/login',
    JSON.stringify([['z.last', 'value:with:colon'], ['a.first', 'значение']]),
  ]]);
  assert.equal(headers['X-GA-Measurement-Id'], 'cv1');
  assert.equal(headers['X-GA-Session-Id'], pulse);
  assert.equal(headers['X-Amplitude-Device-Id'], score);
  assert.equal(headers['X-YM-Counter-Client'], 'v2.10.4-pixel');
  assert.deepEqual(decodeProperties(headers['X-Amplitude-Session-Properties']), canonicalPairs);
  assert.doesNotMatch(headers['X-Amplitude-Session-Properties'], /=/, 'base64url must omit padding');
});

test('empty properties use the canonical empty pair array', async () => {
  const runtime = runtimeReturning({ profile: 'cv1', pulse, score, properties: [] });
  const sdk = new TelemetrySdk({ pixelUrl: '/assets/pixel.wasm' }, async () => runtime);

  const headers = await sdk.getConversionHeaders('/api/auth/register');
  assert.deepEqual(decodeProperties(headers['X-Amplitude-Session-Properties']), []);
});

test('facade shares initialization across concurrent submissions', async () => {
  let loads = 0;
  const runtime = runtimeReturning({ profile: 'cv1', pulse, score, properties: [] });
  const sdk = new TelemetrySdk({ pixelUrl: '/assets/pixel.wasm' }, async () => {
    loads += 1;
    return runtime;
  });

  await Promise.all([
    sdk.getConversionHeaders('/api/auth/login'),
    sdk.getConversionHeaders('/api/auth/register'),
  ]);
  assert.equal(loads, 1);
});

test('malformed runtime payloads are rejected instead of creating partial headers', async () => {
  const sdk = new TelemetrySdk(
    { pixelUrl: '/assets/pixel.wasm' },
    async () => runtimeReturning({ profile: 'cv1', pulse: 'plain-time', score: 'short', properties: [] }),
  );

  await assert.rejects(sdk.getConversionHeaders('/api/auth/login'), /runtime response/);
});
