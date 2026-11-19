import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserView, PageViewSequence } from '../src/page-view.js';

test('viewId остаётся стабильным, а eventId увеличивается little-endian', () => {
  const view = new PageViewSequence([0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c]);
  assert.equal(view.viewId, '000102030405060708090a0b0c0d0e0f');
  const first = view.nextEvent();
  const second = view.nextEvent();
  assert.notEqual(first, second);
  assert.equal(view.viewId, '000102030405060708090a0b0c0d0e0f');
});

test('eventId переносит единицу между словами', () => {
  const view = new PageViewSequence([0xffffffff, 0, 0, 0]);
  assert.equal(view.nextEvent(), '000000000100000000000000000000000000000000000000'.slice(0, 32));
});

test('browser seed воспроизводит production fixture без cryptographic API', () => {
  const view = createBrowserView(1699999920000, 0, () => 0);
  assert.equal(view.viewId, '802fe4cf8b0100000000000000000000');
  assert.equal(view.nextEvent(), '812fe4cf8b0100000000000000000000');
});
