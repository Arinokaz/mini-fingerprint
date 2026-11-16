import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeGate } from '../src/runtime.js';
import type { PixelRuntime } from '../src/types.js';

const runtime: PixelRuntime = {
  calculate_funnel_score: () => JSON.stringify({ profile: 'cv1' }),
};

test('loading starts only when the runtime is first requested', async () => {
  let loads = 0;
  const gate = new RuntimeGate(async () => {
    loads += 1;
    return runtime;
  });

  assert.equal(loads, 0);
  assert.equal(await gate.acquire(), runtime);
  assert.equal(loads, 1);
});

test('concurrent requests share one in-flight initialization', async () => {
  let loads = 0;
  let release: (value: PixelRuntime) => void = () => undefined;
  const pending = new Promise<PixelRuntime>((resolve) => {
    release = resolve;
  });
  const gate = new RuntimeGate(async () => {
    loads += 1;
    return pending;
  });

  const first = gate.acquire();
  const second = gate.acquire();
  assert.strictEqual(first, second);
  release(runtime);
  assert.equal(await first, runtime);
  assert.equal(await second, runtime);
  assert.equal(loads, 1);
});

test('a failed initialization can be retried', async () => {
  let loads = 0;
  const gate = new RuntimeGate(async () => {
    loads += 1;
    if (loads === 1) {
      throw new Error('network unavailable');
    }
    return runtime;
  });

  await assert.rejects(gate.acquire(), /network unavailable/);
  assert.equal(await gate.acquire(), runtime);
  assert.equal(loads, 2);
});
