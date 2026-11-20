import '@angular/compiler';
import assert from 'node:assert/strict';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse, HttpHandlerFn, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import test from 'node:test';
import { productAnalyticsInterceptor } from '../src/angular-interceptor.js';
import { PRODUCT_ANALYTICS } from '../src/providers.js';
import type { ProductAnalytics } from '../src/product-analytics.js';

const headers = {
  'X-PA-Measurement-Id': 'PA-TEST-123',
  'X-PA-Session-Id': '0011223344556677',
  'X-PA-Session-Properties': 'eyJ2IjoicGExIn0',
};
const legacyHeaders = {
  'X-PA-Device-Id': '0123456789abcdef'.repeat(2),
  'X-PA-Event-Id': '0123456789abcdef'.repeat(2),
};
const cv2 = {
  'X-GA-Measurement-Id': 'G-TEST-123',
  'X-GA-Session-Id': '0011223344556677',
  'X-GA-Session-Properties': 'eyJ2IjoiY3YyIn0',
};

function fake(implementation: (path: string) => Promise<Record<string, string>>): ProductAnalytics {
  return { getEngagementHeaders: implementation } as unknown as ProductAnalytics;
}

function intercept(request: HttpRequest<unknown>, analytics: ProductAnalytics, next: HttpHandlerFn) {
  const injector = Injector.create({
    providers: [
      { provide: PRODUCT_ANALYTICS, useValue: analytics },
      { provide: DOCUMENT, useValue: { baseURI: 'http://localhost/' } },
    ],
  });
  return runInInjectionContext(injector, () => productAnalyticsInterceptor(request, next));
}

test('interceptor добавляет ровно три pa1 headers ко всем методам', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const paths: string[] = [];
    let outgoing: HttpRequest<unknown> | undefined;
    const request = new HttpRequest(method, '/api/orders?manual=1#fragment', null);
    await firstValueFrom(intercept(request, fake(async (path) => {
      paths.push(path);
      return headers;
    }), (forwarded) => {
      outgoing = forwarded;
      return of(new HttpResponse({ status: 200 }));
    }));
    assert.deepEqual(paths, ['/api/orders']);
    assert.deepEqual(outgoing?.headers.keys().sort(), Object.keys(headers).sort());
    for (const [name, value] of Object.entries(headers)) {
      assert.equal(outgoing?.headers.get(name), value);
    }
  }
});

test('ошибка pa1 удаляет только собственные headers и сохраняет cv2', async () => {
  const request = new HttpRequest('POST', '/api/auth/login', {}, {
    headers: new HttpHeaders({ ...headers, ...legacyHeaders, ...cv2, 'X-Request-Trace': 'keep' }),
  });
  let outgoing: HttpRequest<unknown> | undefined;
  await firstValueFrom(intercept(request, fake(async () => { throw new Error('unavailable'); }), (forwarded) => {
    outgoing = forwarded;
    return of(new HttpResponse({ status: 200 }));
  }));
  for (const name of [...Object.keys(headers), ...Object.keys(legacyHeaders)]) {
    assert.equal(outgoing?.headers.has(name), false);
  }
  assert.equal(outgoing?.headers.get('X-GA-Measurement-Id'), 'G-TEST-123');
  assert.equal(outgoing?.headers.get('X-GA-Session-Id'), cv2['X-GA-Session-Id']);
  assert.equal(outgoing?.headers.get('X-GA-Session-Properties'), cv2['X-GA-Session-Properties']);
  assert.equal(outgoing?.headers.get('X-Request-Trace'), 'keep');
});

test('HTTP-ошибка downstream не вызывает повторную генерацию', async () => {
  let generations = 0;
  await assert.rejects(firstValueFrom(intercept(
    new HttpRequest('POST', '/api/auth/login', {}),
    fake(async () => {
      generations += 1;
      return headers;
    }),
    () => throwError(() => new HttpErrorResponse({ status: 503 })),
  )));
  assert.equal(generations, 1);
});
