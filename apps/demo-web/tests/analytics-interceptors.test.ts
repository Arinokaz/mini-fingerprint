import '@angular/compiler';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DOCUMENT } from '@angular/common';
import {
  HttpHandlerFn,
  HttpHeaders,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import {
  marketingTelemetryInterceptor,
  TELEMETRY_SDK,
} from '../../../packages/marketing-telemetry/src/angular-interceptor.js';
import type { TelemetrySdk } from '../../../packages/marketing-telemetry/src/conversion.js';
import { productAnalyticsInterceptor } from '../../../packages/product-analytics/src/angular-interceptor.js';
import type { ProductAnalytics } from '../../../packages/product-analytics/src/product-analytics.js';
import { PRODUCT_ANALYTICS } from '../../../packages/product-analytics/src/providers.js';

const cv2Headers = {
  'X-GA-Measurement-Id': 'G-TEST-123',
  'X-GA-Session-Id': '0011223344556677',
  'X-GA-Session-Properties': 'eyJ2IjoiY3YyIn0',
};
const pa1Headers = {
  'X-PA-Measurement-Id': 'PA-TEST-123',
  'X-PA-Session-Id': '8899aabbccddeeff',
  'X-PA-Session-Properties': 'eyJ2IjoicGExIn0',
};
const legacyHeaders = {
  'X-Amplitude-Device-Id': 'stale',
  'X-Amplitude-Event-Id': 'stale',
  'X-Amplitude-Session-Properties': 'c3RhbGU',
  'X-YM-Counter-Client': 'stale',
  'X-PA-Device-Id': 'stale',
  'X-PA-Event-Id': 'stale',
};

function telemetryWith(fails: boolean): TelemetrySdk {
  return {
    getConversionHeaders: async () => {
      if (fails) throw new Error('cv2 unavailable');
      return cv2Headers;
    },
  } as unknown as TelemetrySdk;
}

function analyticsWith(fails: boolean): ProductAnalytics {
  return {
    getEngagementHeaders: async () => {
      if (fails) throw new Error('pa1 unavailable');
      return pa1Headers;
    },
    start: () => undefined,
  } as unknown as ProductAnalytics;
}

async function submit(
  order: 'cv2-last' | 'pa1-last',
  failures: { cv2: boolean; pa1: boolean },
  initialHeaders: Record<string, string> = {},
) {
  const request = new HttpRequest('POST', '/api/orders', {}, {
    headers: new HttpHeaders(initialHeaders),
  });
  const injector = Injector.create({
    providers: [
      { provide: TELEMETRY_SDK, useValue: telemetryWith(failures.cv2) },
      { provide: PRODUCT_ANALYTICS, useValue: analyticsWith(failures.pa1) },
      { provide: DOCUMENT, useValue: { baseURI: 'http://localhost/' } },
    ],
  });
  const interceptors: HttpInterceptorFn[] = order === 'cv2-last'
    ? [productAnalyticsInterceptor, marketingTelemetryInterceptor]
    : [marketingTelemetryInterceptor, productAnalyticsInterceptor];
  let submissions = 0;
  let outgoing: HttpRequest<unknown> | undefined;
  const terminal: HttpHandlerFn = (forwarded) => {
    submissions += 1;
    outgoing = forwarded;
    return of(new HttpResponse({ status: 200 }));
  };
  const chain = interceptors.reduceRight<HttpHandlerFn>(
    (next, interceptor) => (current) => runInInjectionContext(
      injector,
      () => interceptor(current, next),
    ),
    terminal,
  );
  await firstValueFrom(chain(request));
  assert.equal(submissions, 1);
  return outgoing;
}

test('оба interceptor orders создают ровно шесть независимых headers', async () => {
  for (const order of ['cv2-last', 'pa1-last'] as const) {
    const outgoing = await submit(order, { cv2: false, pa1: false });
    assert.deepEqual(outgoing?.headers.keys().sort(), [
      ...Object.keys(cv2Headers),
      ...Object.keys(pa1Headers),
    ].sort());
    for (const [name, value] of Object.entries({ ...cv2Headers, ...pa1Headers })) {
      assert.equal(outgoing?.headers.get(name), value, `${order}: ${name}`);
    }
  }
});

test('независимый сбой удаляет current+legacy только failed контура в обоих orders', async () => {
  for (const order of ['cv2-last', 'pa1-last'] as const) {
    for (const failed of ['cv2', 'pa1'] as const) {
      const outgoing = await submit(
        order,
        { cv2: failed === 'cv2', pa1: failed === 'pa1' },
        {
          ...cv2Headers,
          ...pa1Headers,
          ...legacyHeaders,
          'X-Request-Trace': 'keep',
        },
      );
      const expected = {
        ...(failed === 'cv2' ? pa1Headers : cv2Headers),
        'X-Request-Trace': 'keep',
      };
      assert.deepEqual(outgoing?.headers.keys().sort(), Object.keys(expected).sort());
      for (const [name, value] of Object.entries(expected)) {
        assert.equal(outgoing?.headers.get(name), value, `${order}/${failed}: ${name}`);
      }
    }
  }
});
