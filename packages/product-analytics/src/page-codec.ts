import { add32, rotl32, sub32 } from './page-frame.js';

const K0 = 0x51f15eed;
const K1 = 0x9e3779b9;
const K2 = 0x6d2b79f5;
const C = 0x7f4a7c15;

/** Проверяет и кодирует неотрицательный safe integer timestamp. */
export function encodePageTime(timestamp: number): [number, number] {
  validateTimestamp(timestamp);
  const low = timestamp >>> 0;
  const high = Math.floor(timestamp / 0x100000000) >>> 0;
  const a = (low ^ K0) >>> 0;
  const b = (high ^ K1) >>> 0;
  const x = add32(a, rotl32(b, 11));
  const y = (b ^ rotl32(x, 7)) >>> 0;
  return [(x ^ K2) >>> 0, add32(y, C)];
}

/** Восстанавливает timestamp в обратном порядке операций. */
export function decodePageTime(parts: [number, number]): number {
  const x = (parts[0] ^ K2) >>> 0;
  const y = sub32(parts[1], C);
  const b = (y ^ rotl32(x, 7)) >>> 0;
  const a = sub32(x, rotl32(b, 11));
  const low = (a ^ K0) >>> 0;
  const high = (b ^ K1) >>> 0;
  return high * 0x100000000 + low;
}

/** Возвращает little-endian bytes двух encoded words. */
export function pageTimeToBytes(parts: [number, number]): Uint8Array {
  const output = new Uint8Array(8);
  writeU32(output, 0, parts[0]);
  writeU32(output, 4, parts[1]);
  return output;
}

/** Сериализует encoded time как 16 lowercase hex. */
export function pageTimeToHex(parts: [number, number]): string {
  return bytesToHex(pageTimeToBytes(parts));
}

/** Проверяет timestamp до начала вычисления. */
export function validateTimestamp(timestamp: number): void {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error('Page timestamp must be a non-negative safe integer');
  }
}

/** Разбирает 128-битный analytics ID в шестнадцать байт. */
export function hexIdToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{32}$/.test(value)) {
    throw new Error('Page ID must contain 32 lowercase hex characters');
  }
  const output = new Uint8Array(16);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

/** Преобразует bytes в lowercase hex без изменения порядка. */
export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Записывает unsigned word в little-endian массив. */
export function writeU32(output: Uint8Array, offset: number, value: number): void {
  for (let index = 0; index < 4; index += 1) {
    output[offset + index] = (value >>> (index * 8)) & 0xff;
  }
}

/** Добавляет u64 timestamp как два little-endian words. */
export function timestampToBytes(timestamp: number): Uint8Array {
  validateTimestamp(timestamp);
  const output = new Uint8Array(8);
  writeU32(output, 0, timestamp >>> 0);
  writeU32(output, 4, Math.floor(timestamp / 0x100000000) >>> 0);
  return output;
}

/** Проверяет абсолютный API pathname без query/fragment/NUL. */
export function validateActionPath(value: string): void {
  const length = new TextEncoder().encode(value).length;
  if (length < 1 || length > 512 || !value.startsWith('/') || /[?#\0]/.test(value)) {
    throw new Error('Unsupported page action path');
  }
}

/** Проверяет marker по UTF-8 байтам. */
export function validateSelectedView(value: string): void {
  const length = new TextEncoder().encode(value).length;
  if (length < 1 || length > 256) {
    throw new Error('Unsupported analytics view marker');
  }
}
