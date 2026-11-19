import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ProductAnalytics } from '../src/product-analytics.js';

const fixtures = JSON.parse(readFileSync(
  new URL('../../../tests/fixtures/product-analytics-v1.json', import.meta.url),
  'utf8',
));
const byName = (name: string) => fixtures.cases.find((candidate: {name: string}) => candidate.name === name);

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
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    localStorage: { setItem: () => undefined, removeItem: () => undefined },
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

test('facade формирует точные pa1 headers для последовательности DOM states', async () => {
  const environment = browserEnvironment();
  try {
    const sdk = new ProductAnalytics();
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
        'X-PA-Device-Id',
        'X-PA-Event-Id',
        'X-PA-Measurement-Id',
        'X-PA-Session-Id',
        'X-PA-Session-Properties',
      ].sort());
      assert.equal(headers['X-PA-Measurement-Id'], 'pa1');
      assert.equal(headers['X-PA-Session-Id'], expected.pulse);
      assert.equal(headers['X-PA-Device-Id'], expected.score);
      assert.equal(headers['X-PA-Event-Id'], expected.eventId);
      assert.match(headers['X-PA-Session-Id'], /^[0-9a-f]{16}$/);
      assert.doesNotMatch(headers['X-PA-Session-Properties'], /=/);
      assert.ok(headers['X-PA-Session-Properties'].length <= 1400);
      assert.ok(Buffer.byteLength(JSON.stringify(headers), 'utf8') <= 2048);
      const snapshot = JSON.parse(Buffer.from(headers['X-PA-Session-Properties'], 'base64url').toString('utf8'));
      assert.equal(snapshot.viewId, expected.viewId);
      assert.equal(snapshot.gfx, 1);
      assert.deepEqual(snapshot.engagement, [0, 0, 0, 0]);
      if (!firstEvent) firstEvent = headers['X-PA-Event-Id'];
      if (!sharedView) sharedView = snapshot.viewId;
      assert.equal(snapshot.viewId, sharedView);
    }
    const last = await sdk.getEngagementHeaders('/api/auth/login');
    assert.notEqual(last['X-PA-Event-Id'], firstEvent);
  } finally {
    environment.restore();
  }
});

test('facade сохраняет полный analytics envelope при отсутствии DOM', async () => {
  const environment = browserEnvironment();
  environment.document.markers = [];
  try {
    const sdk = new ProductAnalytics();
    const headers = await sdk.getEngagementHeaders('/api/auth/login');
    const snapshot = JSON.parse(Buffer.from(headers['X-PA-Session-Properties'], 'base64url').toString('utf8'));
    assert.equal(headers['X-PA-Measurement-Id'], 'pa1');
    assert.match(headers['X-PA-Device-Id'], /^[0-9a-f]{32}$/);
    assert.equal(snapshot.screen, '1920x1080');
  } finally {
    environment.restore();
  }
});
