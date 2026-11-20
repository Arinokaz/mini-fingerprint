import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { encodeConversionEnvelope, TelemetrySdk } from '../src/conversion.js';
import type { PixelRuntime, TelemetrySettings } from '../src/types.js';

const score = '0123456789abcdef'.repeat(4);
const pulse = '0011223344556677';
const clickId = '0123456789abcdef'.repeat(2);
const canonicalPairs: [string, string][] = [['a.first', 'значение'], ['z.last', 'value:with:colon']];
const payload = { profile: 'cv2', clickId, pulse, score, properties: canonicalPairs };
const settings = { measurementId: 'G-TEST-123' };

function runtimeReturning(value: unknown, calls: string[][] = []): PixelRuntime {
  return {
    calculate_funnel_score: (...args: string[]) => {
      calls.push(args);
      return JSON.stringify(value);
    },
  };
}

function decodeEnvelope(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

test('cv2 transport matches the independent canonical base64url fixture', () => {
  const fixtures = JSON.parse(readFileSync(
    new URL('../../../tests/fixtures/analytics-transport-v1.json', import.meta.url),
    'utf8',
  ));
  const testCase = fixtures.cases.find((candidate: { name: string }) => candidate.name === 'cv2-three-header-envelope');
  const envelope = JSON.parse(testCase.envelopeJson);
  assert.equal(encodeConversionEnvelope({
    profile: envelope.v,
    clickId: envelope.eid,
    pulse: testCase.pulse,
    score: envelope.sum,
    properties: envelope.props,
  }), testCase.envelope);
});

test('facade applies the default prefix and emits exactly three cv2 headers', async () => {
  const calls: string[][] = [];
  const sdk = new TelemetrySdk(settings, async () => runtimeReturning(payload, calls));

  const headers = await sdk.getConversionHeaders('/api/auth/login', {
    'z.last': 'value:with:colon',
    'a.first': 'значение',
  });

  assert.deepEqual(calls, [[
    '/api/auth/login',
    JSON.stringify([['z.last', 'value:with:colon'], ['a.first', 'значение']]),
    '00',
  ]]);
  assert.deepEqual(Object.keys(headers).sort(), [
    'X-GA-Measurement-Id',
    'X-GA-Session-Id',
    'X-GA-Session-Properties',
  ].sort());
  assert.equal(headers['X-GA-Measurement-Id'], 'G-TEST-123');
  assert.equal(headers['X-GA-Session-Id'], pulse);
  const envelope = decodeEnvelope(headers['X-GA-Session-Properties']);
  assert.deepEqual(Object.keys(envelope), ['client', 'eid', 'props', 'sum', 'v']);
  assert.deepEqual(envelope, {
    client: 'v2.10.4-pixel',
    eid: clickId,
    props: canonicalPairs,
    sum: score,
    v: 'cv2',
  });
  assert.doesNotMatch(headers['X-GA-Session-Properties'], /=/);
  assert.equal(headers['X-Amplitude-Device-Id'], undefined);
  assert.equal(headers['X-Amplitude-Event-Id'], undefined);
  assert.equal(headers['X-YM-Counter-Client'], undefined);
});

test('facade forwards an explicit prefix without changing the caller settings', async () => {
  const calls: string[][] = [];
  const explicitSettings: TelemetrySettings = {
    measurementId: 'G-TEST-123',
    conversion: { scorePrefix: '000' },
  };
  const sdk = new TelemetrySdk(explicitSettings, async () => runtimeReturning(payload, calls));
  await sdk.getConversionHeaders('/api/auth/login');
  assert.deepEqual(calls[0], ['/api/auth/login', '[]', '000']);
  assert.deepEqual(explicitSettings, {
    measurementId: 'G-TEST-123',
    conversion: { scorePrefix: '000' },
  });
});

test('invalid prefixes are rejected before runtime initialization', async () => {
  for (const scorePrefix of ['0000', '0x']) {
    let loads = 0;
    assert.throws(
      () => new TelemetrySdk({ ...settings, conversion: { scorePrefix } }, async () => {
        loads += 1;
        return runtimeReturning(payload);
      }),
      /scorePrefix/,
    );
    assert.equal(loads, 0);
  }
});

test('missing or malformed project IDs fail before runtime initialization', async () => {
  const candidates: unknown[] = [
    {},
    { measurementId: '' },
    { measurementId: 'G bad' },
    { measurementId: 'ab' },
    { measurementId: 'a'.repeat(65) },
    { measurementId: null },
    { measurementId: 123 },
    { measurementId: ['abc'] },
    { measurementId: new String('G-TEST-123') },
  ];
  for (const candidate of candidates) {
    let loads = 0;
    const sdk = new TelemetrySdk(candidate as TelemetrySettings, async () => {
      loads += 1;
      return runtimeReturning(payload);
    });
    await assert.rejects(sdk.getConversionHeaders('/api/auth/login'), /measurementId/);
    assert.equal(loads, 0);
  }
});

test('empty properties use the canonical empty pair array inside the envelope', async () => {
  const sdk = new TelemetrySdk(settings, async () => runtimeReturning({ ...payload, properties: [] }));
  const headers = await sdk.getConversionHeaders('/api/auth/register');
  assert.deepEqual(decodeEnvelope(headers['X-GA-Session-Properties'])['props'], []);
});

test('facade shares initialization across concurrent submissions', async () => {
  let loads = 0;
  const sdk = new TelemetrySdk(settings, async () => {
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
    const sdk = new TelemetrySdk(settings, async () => runtimeReturning(candidate));
    await assert.rejects(sdk.getConversionHeaders('/api/auth/login'), /runtime response/);
  }
});
