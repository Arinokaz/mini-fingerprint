import '@angular/compiler';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse, HttpHandlerFn, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import {
  marketingTelemetryInterceptor,
  TELEMETRY_SDK,
} from '../src/angular-interceptor.js';
import type { TelemetrySdk } from '../src/conversion.js';

const conversionHeaders = {
  'X-GA-Measurement-Id': 'cv1',
  'X-GA-Session-Id': '0011223344556677',
  'X-Amplitude-Device-Id': '0123456789abcdef'.repeat(4),
  'X-Amplitude-Event-Id': '0123456789abcdef'.repeat(2),
  'X-Amplitude-Session-Properties': 'W10',
  'X-YM-Counter-Client': 'v2.10.4-pixel',
};

interface ConversionCall {
  path: string;
  properties: Record<string, string>;
}

function sdkWith(
  implementation: (path: string, properties: Record<string, string>) => Promise<Record<string, string>>,
): TelemetrySdk {
  return { getConversionHeaders: implementation } as unknown as TelemetrySdk;
}

function intercept(
  request: HttpRequest<unknown>,
  sdk: TelemetrySdk,
  next: HttpHandlerFn,
  baseURI = 'http://localhost/',
): Observable<ReturnType<HttpHandlerFn> extends Observable<infer T> ? T : never> {
  const injector = Injector.create({
    providers: [
      { provide: TELEMETRY_SDK, useValue: sdk },
      { provide: DOCUMENT, useValue: { baseURI } },
    ],
  });
  return runInInjectionContext(injector, () => marketingTelemetryInterceptor(request, next));
}

test('every HTTP method receives the complete telemetry header set', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const calls: ConversionCall[] = [];
    let outgoing: HttpRequest<unknown> | undefined;
    const sdk = sdkWith(async (path, properties) => {
      calls.push({ path, properties });
      return conversionHeaders;
    });
    const request = new HttpRequest(method, '/api/orders', null);

    await firstValueFrom(intercept(request, sdk, (forwarded) => {
      outgoing = forwarded;
      return of(new HttpResponse({ status: 200 }));
    }));

    assert.deepEqual(calls, [{ path: '/api/orders', properties: {} }]);
    for (const [name, value] of Object.entries(conversionHeaders)) {
      assert.equal(outgoing?.headers.get(name), value, `${method}: ${name}`);
    }
  }
});

test('only the pathname reaches Wasm for relative and absolute URLs', async () => {
  const cases = [
    { url: '/api/users?manual=1#fragment', params: { page: '2' }, expected: '/api/users' },
    { url: 'https://api.example.test/v1/orders?draft=1#details', expected: '/v1/orders' },
  ];
  for (const testCase of cases) {
    const paths: string[] = [];
    const sdk = sdkWith(async (path) => {
      paths.push(path);
      return conversionHeaders;
    });
    const request = new HttpRequest<unknown>('GET', testCase.url, { params: testCase.params });
    await firstValueFrom(intercept(request, sdk, () => of(new HttpResponse({ status: 200 }))));
    assert.deepEqual(paths, [testCase.expected]);
  }
});

test('path-relative URLs resolve against the actual document base', async () => {
  const paths: string[] = [];
  const sdk = sdkWith(async (path) => {
    paths.push(path);
    return conversionHeaders;
  });
  const request = new HttpRequest<unknown>('GET', 'api/users?manual=1#fragment');

  await firstValueFrom(intercept(
    request,
    sdk,
    () => of(new HttpResponse({ status: 200 })),
    'https://example.test/shop/',
  ));

  assert.deepEqual(paths, ['/shop/api/users']);
});

test('generation failure forwards the original request without partial headers', async () => {
  const request = new HttpRequest<unknown>('POST', '/api/auth/login', { email: 'a@b.test' });
  const sdk = sdkWith(async () => { throw new Error('pixel unavailable'); });
  let outgoing: HttpRequest<unknown> | undefined;

  const response = await firstValueFrom(intercept(request, sdk, (forwarded) => {
    outgoing = forwarded;
    return of(new HttpResponse({ status: 200, body: 'sent' }));
  }));

  assert.equal(response.body, 'sent');
  assert.strictEqual(outgoing, request);
  assert.equal(outgoing?.headers.has('X-Amplitude-Device-Id'), false);
});

test('synchronous generation throw forwards the original request once without telemetry', async () => {
  const request = new HttpRequest<unknown>('POST', '/api/auth/login', { email: 'a@b.test' });
  const sdk = sdkWith(() => { throw new Error('synchronous pixel failure'); });
  let outgoing: HttpRequest<unknown> | undefined;
  let submissions = 0;

  const response = await firstValueFrom(intercept(request, sdk, (forwarded) => {
    submissions += 1;
    outgoing = forwarded;
    return of(new HttpResponse({ status: 200, body: 'sent' }));
  }));

  assert.equal(response.body, 'sent');
  assert.equal(submissions, 1);
  assert.strictEqual(outgoing, request);
  for (const name of Object.keys(conversionHeaders)) {
    assert.equal(outgoing?.headers.has(name), false, `${name} must be absent`);
  }
});

test('generation failure strips stale telemetry headers and preserves unrelated headers', async () => {
  const request = new HttpRequest<unknown>('POST', '/api/auth/login', { email: 'a@b.test' }, {
    headers: new HttpHeaders({
      ...conversionHeaders,
      'X-Request-Trace': 'keep-me',
    }),
  });
  const sdk = sdkWith(async () => { throw new Error('pixel unavailable'); });
  let outgoing: HttpRequest<unknown> | undefined;
  let submissions = 0;

  await firstValueFrom(intercept(request, sdk, (forwarded) => {
    submissions += 1;
    outgoing = forwarded;
    return of(new HttpResponse({ status: 200 }));
  }));

  assert.equal(submissions, 1);
  for (const name of Object.keys(conversionHeaders)) {
    assert.equal(outgoing?.headers.has(name), false, `${name} must be removed`);
  }
  assert.equal(outgoing?.headers.get('X-Request-Trace'), 'keep-me');
  assert.equal(outgoing?.url, request.url);
  assert.deepEqual(outgoing?.body, request.body);
});

test('downstream HTTP failure is not mistaken for generation failure or retried', async () => {
  let generations = 0;
  let submissions = 0;
  const sdk = sdkWith(async () => {
    generations += 1;
    return conversionHeaders;
  });
  const request = new HttpRequest<unknown>('POST', '/api/orders', {});

  await assert.rejects(
    firstValueFrom(intercept(request, sdk, () => {
      submissions += 1;
      return throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' }));
    })),
    (error: unknown) => error instanceof HttpErrorResponse && error.status === 503,
  );
  assert.equal(generations, 1);
  assert.equal(submissions, 1);
});
