import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversionDemoService } from '../src/app/conversion-demo.service.js';
 
const conversionHeaders = {
  'X-GA-Measurement-Id': 'cv1',
  'X-GA-Session-Id': '0011223344556677',
  'X-Amplitude-Device-Id': '0123456789abcdef'.repeat(4),
  'X-Amplitude-Session-Properties': 'W10',
  'X-YM-Counter-Client': 'v2.10.4-pixel',
};

test('submission forwards the exact journey and telemetry headers', async () => {
  const conversionCalls: Array<{ journey: string; properties?: Record<string, string> }> = [];
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const service = new ConversionDemoService(
    {
      getConversionHeaders: async (journey, properties) => {
        conversionCalls.push({ journey, properties });
        return conversionHeaders;
      },
    },
    async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(null, { status: 200 });
    },
  );

  const result = await service.submit('/api/auth/login', 'demo@example.test', 'demo-password');

  assert.deepEqual(conversionCalls, [{
    journey: '/api/auth/login',
    properties: { form: 'login' },
  }]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.input, '/api/auth/login');
  assert.equal(requests[0]?.init?.method, 'POST');
  assert.deepEqual(requests[0]?.init?.headers, {
    ...conversionHeaders,
    'Content-Type': 'application/json',
  });
  assert.deepEqual(result, { status: 200, message: 'Сервер принял запрос.' });

  const body = JSON.parse(String(requests[0]?.init?.body));
  assert.deepEqual(body, { email: 'demo@example.test', password: 'demo-password' });
  assert.equal(body.pulse, undefined, 'the body must not contain an additional plaintext timestamp');
});

test('register uses its own action path and form property', async () => {
  const journeys: string[] = [];
  const service = new ConversionDemoService(
    {
      getConversionHeaders: async (journey) => {
        journeys.push(journey);
        return conversionHeaders;
      },
    },
    async () => new Response(null, { status: 200 }),
  );

  await service.submit('/api/auth/register', 'demo@example.test', 'demo-password');
  assert.deepEqual(journeys, ['/api/auth/register']);
});

test('a rejected response exposes only a generic result', async () => {
  const service = new ConversionDemoService(
    { getConversionHeaders: async () => conversionHeaders },
    async () => new Response('sensitive server detail', { status: 403 }),
  );

  const result = await service.submit('/api/auth/login', 'demo@example.test', 'demo-password');
  assert.deepEqual(result, { status: 403, message: 'Сервер отклонил запрос.' });
  assert.doesNotMatch(result.message, /sensitive/);
});

test('default fetch keeps the browser global receiver', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async function (input, init) {
      assert.strictEqual(this, globalThis, 'fetch must not be bound to ConversionDemoService');
      calls += 1;
      return new Response(null, { status: 200 });
    };
    const service = new ConversionDemoService({
      getConversionHeaders: async () => conversionHeaders,
    });

    await service.submit('/api/auth/login', 'demo@example.test', 'demo-password');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('network and conversion failures remain observable to the component', async () => {
  const networkService = new ConversionDemoService(
    { getConversionHeaders: async () => conversionHeaders },
    async () => { throw new Error('offline'); },
  );
  await assert.rejects(networkService.submit('/api/auth/login', 'a@b.test', 'secret'), /offline/);

  const conversionService = new ConversionDemoService(
    { getConversionHeaders: async () => { throw new Error('pixel unavailable'); } },
    async () => new Response(null, { status: 200 }),
  );
  await assert.rejects(conversionService.submit('/api/auth/login', 'a@b.test', 'secret'), /pixel unavailable/);
});
