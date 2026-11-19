import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculatePageResult, tracePageResult } from '../src/page-conversion.js';
import type { PageContext } from '../src/page-conversion.js';

const fixtures = JSON.parse(readFileSync(
  new URL('../../../tests/fixtures/product-analytics-v1.json', import.meta.url),
  'utf8',
));

for (const testCase of fixtures.cases) {
  test(`golden ${testCase.name}: все стадии и результат совпадают`, () => {
    const context: PageContext = {
      actionPath: testCase.actionPath,
      selectedView: testCase.selectedView,
      viewId: testCase.viewId,
      eventId: testCase.eventId,
      timestamp: testCase.timestamp,
    };
    const traced = tracePageResult(context);
    const expected = (stage: string) => testCase.frames[stage].map((lane: string) => Number.parseInt(lane, 16));
    assert.deepEqual([...traced.frames.page], expected('page'));
    assert.deepEqual([...traced.frames.view], expected('view'));
    assert.deepEqual([...traced.frames.event], expected('event'));
    assert.deepEqual([...traced.frames.time], expected('time'));
    assert.deepEqual(calculatePageResult(context), {
      profile: 'pa1',
      pulse: testCase.pulse,
      score: testCase.score,
      eventId: testCase.eventId,
    });
  });
}
