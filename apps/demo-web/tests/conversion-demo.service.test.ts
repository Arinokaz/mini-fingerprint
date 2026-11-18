import '@angular/compiler';
import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ConversionDemoService } from '../src/app/conversion-demo.service.js';

interface PostCall {
  journey: string;
  body: unknown;
  options: Record<string, unknown>;
}

function httpWith(
  implementation: (journey: string, body: unknown, options: Record<string, unknown>) => unknown,
): { http: HttpClient; calls: PostCall[] } {
  const calls: PostCall[] = [];
  const http = {
    post(journey: string, body: unknown, options: Record<string, unknown>) {
      calls.push({ journey, body, options });
      return implementation(journey, body, options);
    },
  } as unknown as HttpClient;
  return { http, calls };
}

test('submission sends credentials through HttpClient without manual telemetry headers', async () => {
  const { http, calls } = httpWith(() => of(new HttpResponse({ status: 200 })));
  const service = new ConversionDemoService(http);

  const result = await service.submit('/api/auth/login', 'demo@example.test', 'demo-password');

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.journey, '/api/auth/login');
  assert.deepEqual(calls[0]?.body, { email: 'demo@example.test', password: 'demo-password' });
  assert.equal(calls[0]?.options['observe'], 'response');
  assert.equal(calls[0]?.options['headers'], undefined);
  assert.deepEqual(result, { status: 200, message: 'Сервер принял запрос.' });
});

test('register uses its own action path without a special telemetry property', async () => {
  const { http, calls } = httpWith(() => of(new HttpResponse({ status: 200 })));
  const service = new ConversionDemoService(http);

  await service.submit('/api/auth/register', 'demo@example.test', 'demo-password');

  assert.deepEqual(calls.map((call) => call.journey), ['/api/auth/register']);
  assert.deepEqual(calls[0]?.body, { email: 'demo@example.test', password: 'demo-password' });
});

test('an HTTP rejection exposes only a generic result', async () => {
  const { http } = httpWith(() => throwError(() => new HttpErrorResponse({
    status: 403,
    error: 'sensitive server detail',
  })));
  const service = new ConversionDemoService(http);

  const result = await service.submit('/api/auth/login', 'a@b.test', 'secret');

  assert.deepEqual(result, { status: 403, message: 'Сервер отклонил запрос.' });
  assert.doesNotMatch(result.message, /sensitive/);
});

test('network failures remain observable to the component', async () => {
  const { http } = httpWith(() => throwError(() => new HttpErrorResponse({ status: 0 })));
  const service = new ConversionDemoService(http);

  await assert.rejects(
    service.submit('/api/auth/login', 'a@b.test', 'secret'),
    (error: unknown) => error instanceof HttpErrorResponse && error.status === 0,
  );
});
