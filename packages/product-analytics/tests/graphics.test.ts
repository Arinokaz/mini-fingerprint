import assert from 'node:assert/strict';
import test from 'node:test';
import { readGraphics } from '../src/graphics.js';

function canvasWith(renderer: string | null, hasContext = true): HTMLCanvasElement {
  const context = {
    getExtension: () => renderer === null ? null : { UNMASKED_RENDERER_WEBGL: 1 },
    getParameter: () => renderer,
  };
  return {
    getContext: () => hasContext ? context : null,
  } as unknown as HTMLCanvasElement;
}

test('отсутствие canvas или graphics context означает unavailable', () => {
  assert.equal(readGraphics(null), 3);
  assert.equal(readGraphics(canvasWith(null, false)), 3);
});

test('отсутствие extension и generic renderer означают unknown', () => {
  assert.equal(readGraphics(canvasWith(null)), 0);
  assert.equal(readGraphics(canvasWith('WebKit WebGL')), 0);
  assert.equal(readGraphics(canvasWith('Mozilla')), 0);
});

test('software renderer классифицируется без возврата исходной строки', () => {
  for (const renderer of ['Google SwiftShader', 'Mesa llvmpipe', 'softpipe']) {
    assert.equal(readGraphics(canvasWith(renderer)), 2);
  }
});

test('обычный hardware-like renderer получает standard', () => {
  assert.equal(readGraphics(canvasWith('ANGLE (NVIDIA GeForce RTX 4070)')), 1);
});
