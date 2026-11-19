import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculatePageResult } from '../src/page-conversion.js';
import { createAnalyticsSnapshot, serializeSnapshot } from '../src/snapshot.js';

const input = {
  viewId: '802fe4cf8b0100000000000000000000',
  screenWidth: 1920,
  screenHeight: 1080,
  viewportWidth: 1280,
  viewportHeight: 720,
  devicePixelRatio: 1,
  hardwareConcurrency: 8,
  maxTouchPoints: 0,
  language: 'ru-RU',
  timezone: 'Europe/Moscow',
  graphics: 1 as const,
  features: 255,
  engagement: [0, 0, 0, 0] as [number, number, number, number],
};

test('snapshot сериализуется компактно и остаётся в бюджете', () => {
  const snapshot = createAnalyticsSnapshot(input);
  const json = serializeSnapshot(snapshot);
  const encoded = Buffer.from(json, 'utf8').toString('base64url');
  assert.equal(json, '{"v":1,"viewId":"802fe4cf8b0100000000000000000000","screen":"1920x1080","viewport":"1280x720","dpr":100,"cores":8,"touch":0,"lang":"ru-RU","tz":"Europe/Moscow","gfx":1,"features":255,"engagement":[0,0,0,0]}');
  assert.ok(Buffer.byteLength(json, 'utf8') <= 1024);
  assert.ok(encoded.length <= 1400);
  console.log(`pa1 snapshot: raw=${Buffer.byteLength(json, 'utf8')}, base64url=${encoded.length}`);
});

test('ограничения Unicode и числовых полей не создают malformed snapshot', () => {
  const snapshot = createAnalyticsSnapshot({
    ...input,
    language: 'я'.repeat(100),
    timezone: 'Europe/' + 'ю'.repeat(100),
    devicePixelRatio: 100,
    hardwareConcurrency: 128,
    maxTouchPoints: 99,
    screenWidth: Number.NaN,
  });
  const json = serializeSnapshot(snapshot);
  assert.equal(snapshot.screen, 'unavailable');
  assert.equal(snapshot.dpr, 400);
  assert.equal(snapshot.cores, 16);
  assert.equal(snapshot.touch, 5);
  assert.ok(Buffer.byteLength(snapshot.lang, 'utf8') <= 32);
  assert.ok(Buffer.byteLength(snapshot.tz, 'utf8') <= 64);
  assert.doesNotThrow(() => JSON.parse(json));
});

test('graphics и engagement не участвуют в pa1 score', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../../tests/fixtures/product-analytics-v1.json', import.meta.url), 'utf8'));
  const testCase = fixture.cases[0];
  const context = {
    actionPath: testCase.actionPath,
    selectedView: testCase.selectedView,
    viewId: testCase.viewId,
    eventId: testCase.eventId,
    timestamp: testCase.timestamp,
  };
  const before = calculatePageResult(context).score;
  createAnalyticsSnapshot({ ...input, graphics: 2, engagement: [1, 3, 63, 4] });
  assert.equal(calculatePageResult(context).score, before);
});
