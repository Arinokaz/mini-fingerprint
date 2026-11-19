import assert from 'node:assert/strict';
import test from 'node:test';
import { EngagementState } from '../src/engagement.js';

class Target {
  handlers = new Map<string, () => void>();
  additions = 0;
  addEventListener(type: string, handler: () => void): void {
    this.additions += 1;
    this.handlers.set(type, handler);
  }
  fire(type: string): void {
    this.handlers.get(type)?.();
  }
}

test('пустое состояние и возраст view имеют точные buckets', () => {
  const state = new EngagementState(0);
  const target = new Target();
  state.start(target as unknown as Document);
  assert.deepEqual(state.snapshot(999), [0, 0, 0, 0]);
  assert.deepEqual(state.snapshot(1000), [0, 0, 0, 1]);
  assert.deepEqual(state.snapshot(5000), [0, 0, 0, 2]);
  assert.deepEqual(state.snapshot(15000), [0, 0, 0, 3]);
  assert.deepEqual(state.snapshot(60000), [0, 0, 0, 4]);
});

test('focus и visibility не создают qualifying активность', () => {
  const state = new EngagementState(0);
  const target = new Target();
  state.start(target as unknown as Document);
  target.fire('focus');
  target.fire('blur');
  target.fire('visibilitychange');
  const snapshot = state.snapshot(100);
  assert.equal(snapshot[0], 0);
  assert.equal(snapshot[1], 0);
  assert.equal(snapshot[2] & (16 | 32), 16 | 32);
});

test('input события задают категории и capped count buckets', () => {
  const state = new EngagementState(0);
  const target = new Target();
  state.start(target as unknown as Document);
  target.fire('mousemove');
  assert.deepEqual(state.snapshot(100).slice(0, 3), [1, 1, 1]);
  target.fire('keydown');
  assert.equal(state.snapshot(100)[1], 2);
  for (let index = 0; index < 4; index += 1) target.fire('touchstart');
  target.fire('scroll');
  assert.equal(state.snapshot(100)[1], 3);
  assert.equal(state.snapshot(100)[2] & 15, 15);
});

test('повторный start не сбрасывает состояние и не дублирует listeners', () => {
  const state = new EngagementState(0);
  const target = new Target();
  state.start(target as unknown as Document);
  const additions = target.additions;
  target.fire('keydown');
  state.start(target as unknown as Document);
  assert.equal(target.additions, additions);
  assert.equal(state.snapshot(100)[1], 1);
});
