import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodePageTime,
  encodePageTime,
  hexIdToBytes,
  validateActionPath,
  validateSelectedView,
} from '../src/page-codec.js';

test('кодирование времени обратимо на границах', () => {
  for (const timestamp of [0, 1, 0xffffffff, 0x100000000, 1699999920]) {
    assert.equal(decodePageTime(encodePageTime(timestamp)), timestamp);
  }
});

test('идентификаторы требуют ровно 32 lowercase hex', () => {
  assert.equal(hexIdToBytes('000102030405060708090a0b0c0d0e0f').length, 16);
  for (const invalid of ['', '00', 'A00102030405060708090a0b0c0d0e0f', 'g00102030405060708090a0b0c0d0e0f']) {
    assert.throws(() => hexIdToBytes(invalid));
  }
});

test('путь и view marker проверяются по byte-oriented правилам', () => {
  assert.doesNotThrow(() => validateActionPath('/api/auth/login'));
  for (const invalid of ['', 'api/login', '/api?q=1', '/api#x', '/api\0']) {
    assert.throws(() => validateActionPath(invalid));
  }
  assert.doesNotThrow(() => validateSelectedView('а'.repeat(256 / 2)));
  assert.throws(() => validateSelectedView(''));
  assert.throws(() => validateSelectedView('а'.repeat(129)));
});
