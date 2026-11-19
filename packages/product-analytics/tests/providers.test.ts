import '@angular/compiler';
import assert from 'node:assert/strict';
import { ENVIRONMENT_INITIALIZER, Injector } from '@angular/core';
import test from 'node:test';
import { PRODUCT_ANALYTICS, provideProductAnalytics } from '../src/providers.js';
import type { ProductAnalytics } from '../src/product-analytics.js';

test('Angular initializer запускает сбор engagement ровно один раз', () => {
  let starts = 0;
  const analytics = { start: () => { starts += 1; } } as unknown as ProductAnalytics;
  const injector = Injector.create({
    providers: [
      provideProductAnalytics(),
      { provide: PRODUCT_ANALYTICS, useValue: analytics },
    ],
  });
  const initializers = injector.get(ENVIRONMENT_INITIALIZER);
  assert.ok(initializers.length >= 1);
  assert.equal(starts, 1);
});
