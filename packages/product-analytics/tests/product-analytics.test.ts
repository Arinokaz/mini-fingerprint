import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { encodeEngagementEnvelope, ProductAnalytics } from '../src/product-analytics.js';
import type { ProductAnalyticsSettings } from '../src/types.js';

const fixtures = JSON.parse(readFileSync(
  new URL('../../../tests/fixtures/product-analytics-v1.json', import.meta.url),
  'utf8',
));
const byName = (name: string) => fixtures.cases.find((candidate: {name: string}) => candidate.name === name);
const settings = { measurementId: 'PA-TEST-123' };

function decodeTransport(headers: Record<string, string>) {
  const envelope = JSON.parse(Buffer.from(headers['X-PA-Session-Properties'], 'base64url').toString('utf8'));
  return { envelope, snapshot: JSON.parse(envelope.data) };
}

function browserEnvironment() {
  const renderer = 'ANGLE (NVIDIA GeForce RTX 4070)';
  const canvas = {
    dataset: { view: 'production-view-2026.11' },
    getContext: () => ({
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
      getParameter: () => renderer,
    }),
  };
  const document = {
    markers: [canvas] as unknown[],
    querySelectorAll(selector: string) {
      return selector === 'canvas.analytics_stage' ? this.markers : [];
    },
    addEventListener: () => undefined,
  };
  const storage = new Map<string, string>();
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  };
  const navigator = {
    language: 'ru-RU',
    languages: ['ru-RU'],
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    cookieEnabled: true,
    pdfViewerEnabled: true,
    userActivation: { hasBeenActive: false },
  };
  const screen = { width: 1920, height: 1080 };
  const keys = ['document', 'window', 'navigator', 'screen'] as const;
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const key of keys) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: { document, window, navigator, screen }[key],
    });
  }
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalPerformanceNow = performance.now;
  Date.now = () => 1699999920000;
  Math.random = () => 0;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => 0 });
  return {
    canvas,
    document,
    storage,
    restore() {
      Date.now = originalNow;
      Math.random = originalRandom;
      Object.defineProperty(performance, 'now', { configurable: true, value: originalPerformanceNow });
      for (const key of keys) {
        const descriptor = descriptors.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('pa1 transport совпадает с независимой canonical base64url fixture', () => {
  const testCase = JSON.parse(readFileSync(
    new URL('../../../tests/fixtures/analytics-transport-v1.json', import.meta.url),
    'utf8',
  )).cases.find((candidate: { name: string }) => candidate.name === 'pa1-three-header-envelope');
  const envelope = JSON.parse(testCase.envelopeJson);
  assert.equal(encodeEngagementEnvelope(envelope.data, {
    eventId: envelope.eid,
    score: envelope.sum,
  }), testCase.envelope);
});

test('facade формирует точные pa1 headers для последовательности DOM states', async () => {
  const environment = browserEnvironment();
  try {
    const sdk = new ProductAnalytics(settings);
    sdk.start();
    const requests = [
      { expected: 'login-production-valid', markers: undefined },
      { expected: 'login-production-missing', markers: [] },
      { expected: 'login-production-empty', markers: [{ ...environment.canvas, dataset: { view: '' } }] },
      { expected: 'login-production-duplicate', markers: [environment.canvas, environment.canvas] },
    ];
    let firstEvent = '';
    let sharedView = '';
    for (const request of requests) {
      if (request.markers) environment.document.markers = request.markers;
      const headers = await sdk.getEngagementHeaders('/api/auth/login');
      const expected = byName(request.expected);
      assert.deepEqual(Object.keys(headers).sort(), [
        'X-PA-Measurement-Id',
        'X-PA-Session-Id',
        'X-PA-Session-Properties',
      ].sort());
      assert.equal(headers['X-PA-Measurement-Id'], 'PA-TEST-123');
      assert.equal(headers['X-PA-Session-Id'], expected.pulse);
      assert.match(headers['X-PA-Session-Id'], /^[0-9a-f]{16}$/);
      assert.doesNotMatch(headers['X-PA-Session-Properties'], /=/);
      assert.ok(headers['X-PA-Session-Properties'].length <= 1400);
      assert.ok(Buffer.byteLength(JSON.stringify(headers), 'utf8') <= 2048);
      const { envelope, snapshot } = decodeTransport(headers);
      assert.deepEqual(Object.keys(envelope), ['data', 'eid', 'sum', 'v']);
      assert.equal(envelope.eid, expected.eventId);
      assert.equal(envelope.sum, expected.score);
      assert.equal(envelope.v, 'pa1');
      assert.equal(headers['X-PA-Device-Id'], undefined);
      assert.equal(headers['X-PA-Event-Id'], undefined);
      assert.equal(snapshot.viewId, expected.viewId);
      assert.equal(snapshot.gfx, 1);
      assert.deepEqual(snapshot.engagement, [0, 0, 0, 0]);
      if (!firstEvent) firstEvent = envelope.eid;
      if (!sharedView) sharedView = snapshot.viewId;
      assert.equal(snapshot.viewId, sharedView);
    }
    const last = await sdk.getEngagementHeaders('/api/auth/login');
    assert.notEqual(decodeTransport(last).envelope.eid, firstEvent);
  } finally {
    environment.restore();
  }
});

test('facade сохраняет полный analytics envelope при отсутствии DOM', async () => {
  const environment = browserEnvironment();
  environment.document.markers = [];
  try {
    const sdk = new ProductAnalytics(settings);
    const headers = await sdk.getEngagementHeaders('/api/auth/login');
    const { envelope, snapshot } = decodeTransport(headers);
    assert.equal(headers['X-PA-Measurement-Id'], 'PA-TEST-123');
    assert.match(envelope.sum, /^[0-9a-f]{32}$/);
    assert.equal(snapshot.screen, '1920x1080');
  } finally {
    environment.restore();
  }
});

test('missing или malformed project ID вызывает generation failure', async () => {
  const candidates: unknown[] = [
    {},
    { measurementId: '' },
    { measurementId: 'PA bad' },
    { measurementId: 'ab' },
    { measurementId: null },
    { measurementId: 123 },
    { measurementId: ['abc'] },
    { measurementId: new String('PA-TEST-123') },
  ];
  for (const candidate of candidates) {
    const sdk = new ProductAnalytics(candidate as ProductAnalyticsSettings);
    await assert.rejects(sdk.getEngagementHeaders('/api/auth/login'), /measurementId/);
  }
});

test('capability probe сохраняет существующее значение storage', async () => {
  const environment = browserEnvironment();
  environment.storage.set('pa.capability', 'application-value');
  try {
    const sdk = new ProductAnalytics(settings);
    await sdk.getEngagementHeaders('/api/auth/login');
    assert.equal(environment.storage.get('pa.capability'), 'application-value');
  } finally {
    environment.restore();
  }
});
