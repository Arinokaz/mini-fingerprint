import assert from 'node:assert/strict';
import test from 'node:test';
import { add32, mul32, rotl32, settlePageFrame } from '../src/page-frame.js';

test('арифметика pa1 сохраняет младшие 32 бита', () => {
  assert.equal(add32(0xffffffff, 1), 0);
  assert.equal(mul32(0xffffffff, 0xffffffff), 1);
  assert.equal(rotl32(0x80000001, 1), 3);
  assert.equal(rotl32(0x12345678, 0), 0x12345678);
});

test('дополнительные проекции не меняют завершённый frame', () => {
  let frame: [number, number, number, number] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a];
  for (let index = 0; index < 10_000; index += 1) {
    const original: [number, number, number, number] = [...frame];
    const actual = settlePageFrame(original, index & 0xff, index % 4);
    assert.deepEqual(actual, original);
    frame = [
      add32(frame[0], index),
      mul32(frame[1] ^ index, 0x9e3779b1),
      rotl32(frame[2], 1),
      (frame[3] ^ add32(index, 0x7f4a7c15)) >>> 0,
    ];
  }
});
