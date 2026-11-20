import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'undici';

 /** Repository root and production output under test. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserRoot = process.env['DEMO_BROWSER_ROOT']
  ? resolve(root, process.env['DEMO_BROWSER_ROOT'])
  : resolve(root, 'apps/demo-web/dist/demo-web/browser');
const packageVariant = process.env['TELEMETRY_VARIANT'] ?? 'embedded';
const productOnly = process.env['PRODUCT_ONLY'] === '1';
console.log(`Browser check: requested variant=${packageVariant}; mode=${productOnly ? 'product-only' : 'full'}; platform=${process.platform}.`);
assert.ok(['embedded', 'lazy'].includes(packageVariant), `Unknown telemetry variant: ${packageVariant}`);
const profileDirectory = resolve(tmpdir(), 'opencode', 'chrome-profile');

/** Existing browser paths; CHROME_BIN can override discovery without installation. */
const candidates = [
  process.env['CHROME_BIN'],
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
  '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const chrome = candidates.find((candidate) => existsSync(candidate));
assert.ok(chrome, 'No existing Chromium browser found; set CHROME_BIN or install one explicitly.');

// Delegate only when the selected browser is a Windows binary. An explicit
// Linux CHROME_BIN always stays on Linux. Set BROWSER_CHECK_NO_WINDOWS=1 to
// disable delegation explicitly; native WebSocket requires Windows Node 22+.
const windowsNode = '/mnt/c/Program Files/nodejs/node.exe';
const selectedWindowsBrowser = process.platform === 'linux' && chrome.startsWith('/mnt/c/');
const mayDelegate = process.env['BROWSER_CHECK_NO_WINDOWS'] !== '1';
if (selectedWindowsBrowser && process.env['WSL_DISTRO_NAME'] && mayDelegate) {
  assert.ok(
    existsSync(windowsNode),
    'A Windows browser requires existing Windows Node.js 22+; set CHROME_BIN to a Linux browser or BROWSER_CHECK_NO_WINDOWS=1.',
  );
  const versionResult = spawnSync(windowsNode, ['--version'], { encoding: 'utf8' });
  const major = Number.parseInt(String(versionResult.stdout).replace(/^v/, '').split('.')[0], 10);
  assert.ok(versionResult.status === 0 && major >= 22, 'Windows Node.js 22+ with native WebSocket is required.');
  const scriptPath = execFileSync('wslpath', ['-w', fileURLToPath(import.meta.url)], { encoding: 'utf8' }).trim();
  const delegatedBrowserRoot = process.env['DEMO_BROWSER_ROOT'] === undefined
    ? {}
    : { DEMO_BROWSER_ROOT: execFileSync('wslpath', ['-w', browserRoot], { encoding: 'utf8' }).trim() };
  const delegatedVariables = [
    'TELEMETRY_VARIANT/w',
    ...(productOnly ? ['PRODUCT_ONLY/w'] : []),
    ...(process.env['DEMO_BROWSER_ROOT'] === undefined ? [] : ['DEMO_BROWSER_ROOT/w']),
  ];
  const result = spawnSync(windowsNode, [scriptPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      TELEMETRY_VARIANT: packageVariant,
      ...delegatedBrowserRoot,
      WSLENV: [process.env['WSLENV'], ...delegatedVariables].filter(Boolean).join(':'),
    },
  });
  process.exit(result.status ?? 1);
}

assert.ok(existsSync(resolve(browserRoot, 'index.html')), 'Build demo-web production before this check.');
const indexDocument = await readFile(resolve(browserRoot, 'index.html'), 'utf8');
const initialScriptPaths = new Set(
  [...indexDocument.matchAll(/(?:src|href)=["']([^"']+\.js)["']/g)]
    .map((match) => new URL(match[1], 'http://localhost/').pathname),
);
const fixtureDocument = JSON.parse(await readFile(resolve(root, 'tests/fixtures/conversion-v2.json'), 'utf8'));
const fixtureByName = new Map(fixtureDocument.cases.map((testCase) => [testCase.name, testCase]));
const productFixtureDocument = JSON.parse(await readFile(resolve(root, 'tests/fixtures/product-analytics-v1.json'), 'utf8'));
const productFixtureByName = new Map(productFixtureDocument.cases.map((testCase) => [testCase.name, testCase]));
const validLogin = fixtureByName.get('login-production-valid');
const missingLogin = fixtureByName.get('login-production-missing');
const emptyLogin = fixtureByName.get('login-production-empty');
const duplicateLogin = fixtureByName.get('login-production-duplicate');
const validRegister = fixtureByName.get('register-production-valid');
const productValidLogin = productFixtureByName.get('login-production-valid');
const productMissingLogin = productFixtureByName.get('login-production-missing');
const productEmptyLogin = productFixtureByName.get('login-production-empty');
const productDuplicateLogin = productFixtureByName.get('login-production-duplicate');
const productValidRegister = productFixtureByName.get('register-production-valid');
assert.ok(validLogin && missingLogin && emptyLogin && duplicateLogin && validRegister, 'Production cv2 golden fixtures are required.');
assert.ok(productValidLogin && productMissingLogin && productEmptyLogin && productDuplicateLogin && productValidRegister, 'Production pa1 golden fixtures are required.');
await mkdir(profileDirectory, { recursive: true });

/** Uses the native temporary filesystem so Chromium locking works on WSL too. */
const browserProfile = profileDirectory;

/** MIME types required by Angular and WebAssembly.instantiateStreaming. */
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.json', 'application/json; charset=utf-8'],
]);

/** Serves production assets and returns the same generic 403 for demo API calls. */
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'rejected' }));
    return;
  }
  const requestPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = resolve(browserRoot, requestPath);
  const relativeFile = relative(browserRoot, file);
  if (relativeFile.startsWith('..') || isAbsolute(relativeFile) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': mimeTypes.get(extname(file)) ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
assert.ok(address && typeof address === 'object');
const applicationUrl = `http://127.0.0.1:${address.port}/`;
console.log(`Browser check: serving ${applicationUrl}`);

/** Uses a process-specific DevTools port to avoid collisions between test runs. */
const debugPort = 9222 + (process.pid % 1000);

/** Launches the existing browser with an isolated, ignored temporary profile. */
const chromeProcess = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${browserProfile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeErrors = '';
chromeProcess.stderr.on('data', (chunk) => {
  chromeErrors = `${chromeErrors}${chunk}`.slice(-8000);
});

/** Waits for a condition rather than relying on fixed browser startup delays. */
async function waitFor(check, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out: ${description}. ${lastError ?? ''}\n${chromeErrors}`);
}

/** Minimal DevTools Protocol client built on Node's native WebSocket. */
class DevTools {
  pending = new Map();
  listeners = new Set();
  nextId = 1;

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          pending?.reject(new Error(JSON.stringify(message.error)));
        } else {
          pending?.resolve(message.result);
        }
      } else {
        for (const listener of this.listeners) {
          listener(message);
        }
      }
    });
  }

  async send(method, params = {}) {
    const id = this.nextId++;
    const command = new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
    return Promise.race([
      command,
      delay(10_000).then(() => {
        this.pending.delete(id);
        throw new Error(`DevTools command timed out: ${method}`);
      }),
    ]);
  }

  onEvent(listener) {
    this.listeners.add(listener);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }
}

let socket;
const watchdog = setTimeout(() => {
  console.error('Browser check watchdog expired.');
  chromeProcess.kill();
  server.close();
  process.exit(2);
}, 60_000);
try {
  console.log('Browser check: waiting for DevTools.');
  const pages = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return response.ok ? response.json() : null;
  }, 'Chromium DevTools endpoint');
  const page = pages.find((candidate) => candidate.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'No debuggable Chromium page.');
  console.log('Browser check: DevTools connected over HTTP; opening WebSocket.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  console.log('Browser check: WebSocket open; enabling page instrumentation.');
  const devtools = new DevTools(socket);
  const requests = [];
  const networkUrls = [];
  const exceptions = [];
  const consoleMessages = [];
  devtools.onEvent((message) => {
    if (message.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push(message.params.args.map((argument) => argument.value ?? argument.description).join(' '));
    }
      if (message.method === 'Network.requestWillBeSent') {
      networkUrls.push(message.params.request.url);
      if (message.params.request.url.includes('/api/auth/')) {
        requests.push(message.params.request);
      }
    }
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails);
    }
  });

  await devtools.send('Page.enable');
  await devtools.send('Runtime.enable');
  await devtools.send('Network.enable');
  await devtools.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Date.now = () => ${validLogin.now * 1000};
      Math.random = () => 0;
      Object.defineProperty(window.performance, 'now', { configurable: true, value: () => 0 });
      ${productOnly ? "Object.defineProperty(window, 'WebAssembly', { configurable: true, value: undefined });" : ''}
    `,
  });
  console.log(`Browser check: navigating to ${applicationUrl}`);
  await devtools.send('Page.navigate', { url: applicationUrl });
  console.log('Browser check: navigation command completed.');
  await waitFor(
    () => devtools.evaluate("document.readyState === 'complete' && document.querySelectorAll('button').length === 2"),
    'Angular page and controls',
  );
  const deferredScriptRequests = () => networkUrls.filter((url) => {
    const pathname = new URL(url).pathname;
    return pathname.endsWith('.js') && !initialScriptPaths.has(pathname);
  });
  if (packageVariant === 'lazy') {
    assert.deepEqual(deferredScriptRequests(), [], 'lazy pixel chunk must not load with the initial page');
  }

  /** Returns header lookup helpers with case-insensitive names. */
  const headersOf = (request) => Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const cv2Names = ['x-ga-measurement-id', 'x-ga-session-id', 'x-ga-session-properties'];
  const pa1Names = ['x-pa-measurement-id', 'x-pa-session-id', 'x-pa-session-properties'];
  const assertOwnedNames = (headers) => {
    const actual = Object.keys(headers).filter((name) => (
      /^(?:x-ga-|x-pa-|x-amplitude-|x-ym-)/.test(name)
    )).sort();
    assert.deepEqual(actual, [...(productOnly ? [] : cv2Names), ...pa1Names].sort());
  };
  const decodeEnvelope = (headers, name) => JSON.parse(
    Buffer.from(headers[name], 'base64url').toString('utf8'),
  );
  const assertConversion = (headers, testCase) => {
    assert.equal(headers['x-ga-measurement-id'], 'G-8F3K2M7Q');
    assert.equal(headers['x-ga-session-id'], testCase.pulse);
    const envelope = decodeEnvelope(headers, 'x-ga-session-properties');
    assert.deepEqual(Object.keys(envelope), ['client', 'eid', 'props', 'sum', 'v']);
    assert.equal(envelope.client, 'v2.10.4-pixel');
    assert.equal(envelope.eid, testCase.clickId);
    assert.deepEqual(envelope.props, []);
    assert.equal(envelope.sum, testCase.score);
    assert.equal(envelope.v, 'cv2');
    assert.ok(envelope.sum.startsWith(testCase.scorePrefix));
  };
  const assertProduct = (headers, testCase) => {
    assert.equal(headers['x-pa-measurement-id'], 'PA-59DK2M8Q');
    assert.equal(headers['x-pa-session-id'], testCase.pulse);
    assert.ok(headers['x-pa-session-properties'].length <= 1400);
    const envelope = decodeEnvelope(headers, 'x-pa-session-properties');
    assert.deepEqual(Object.keys(envelope), ['data', 'eid', 'sum', 'v']);
    assert.equal(envelope.eid, testCase.eventId);
    assert.equal(envelope.sum, testCase.score);
    assert.equal(envelope.v, 'pa1');
    const snapshot = JSON.parse(envelope.data);
    assert.equal(snapshot.viewId, testCase.viewId);
    assert.equal(snapshot.features & 1, productOnly ? 0 : 1);
    assert.equal(snapshot.features & 4, 4, 'Canvas2D must use an independent real context');
    assert.equal(snapshot.features & 2, snapshot.gfx === 3 ? 0 : 2, 'WebGL bit must match the actual context');
    assert.ok(Array.isArray(snapshot.engagement) && snapshot.engagement.length === 4);
  };
  const assertRequest = (headers, conversionCase, productCase) => {
    assertOwnedNames(headers);
    if (!productOnly) assertConversion(headers, conversionCase);
    assertProduct(headers, productCase);
  };
  const click = async (index, expectedRequests) => {
    console.log(`Browser check: click button ${index}, expecting request ${expectedRequests}.`);
    await devtools.evaluate(`document.querySelectorAll('button')[${index}].click()`);
    await waitFor(async () => {
      if (requests.length >= expectedRequests) {
        return true;
      }
      const status = await devtools.evaluate("document.querySelector('[role=status]').textContent");
      return status.includes('Не удалось');
    }, `request ${expectedRequests}`);
    if (requests.length < expectedRequests) {
      const status = await devtools.evaluate("document.querySelector('[role=status]').textContent");
      throw new Error(`Request ${expectedRequests} was not sent; status=${status}; console=${consoleMessages.join(' | ')}; resources=${networkUrls.join(', ')}`);
    }
    await waitFor(
      () => devtools.evaluate("document.querySelector('[role=status]').textContent.includes('403')"),
      `generic 403 status ${expectedRequests}`,
    );
  };

  await click(0, 1);
  if (packageVariant === 'lazy') {
    assert.equal(deferredScriptRequests().length, 1, 'lazy chunk must load on the first submission');
  }
  const validHeaders = headersOf(requests[0]);
  assertRequest(validHeaders, validLogin, productValidLogin);
  assert.ok(!Object.keys(validHeaders).includes('x-client-timestamp'));

  // Removing the only marker must still produce a request with a different score.
  await devtools.evaluate("document.querySelector('span.telemetrics_click')?.remove(); document.querySelector('canvas.analytics_stage')?.remove()");
  await click(0, 2);
  const missingHeaders = headersOf(requests[1]);
  assertRequest(missingHeaders, missingLogin, productMissingLogin);
  if (!productOnly) {
    assert.notEqual(
      decodeEnvelope(missingHeaders, 'x-ga-session-properties').sum,
      decodeEnvelope(validHeaders, 'x-ga-session-properties').sum,
    );
  }

  // Empty and duplicate markers use the same fallback but distinct click sequences.
  await devtools.evaluate(`(() => {
    const span = document.createElement('span');
    span.className = 'telemetrics_click';
    span.dataset.tag = '';
    document.querySelector('app-root').appendChild(span);
    const secondCanvas = document.createElement('canvas');
    secondCanvas.className = 'analytics_stage';
    secondCanvas.dataset.view = 'second-view';
    document.querySelector('app-root').appendChild(secondCanvas);
    const canvas = document.createElement('canvas');
    canvas.className = 'analytics_stage';
    canvas.dataset.view = '';
    document.querySelector('app-root').appendChild(canvas);
  })()`);
  await click(0, 3);
  assertRequest(headersOf(requests[2]), emptyLogin, productEmptyLogin);

  await devtools.evaluate(`(() => {
    const second = document.createElement('span');
    second.className = 'telemetrics_click';
    second.dataset.tag = 'second-tag';
    document.querySelector('app-root').appendChild(second);
  })()`);
  await click(0, 4);
  assertRequest(headersOf(requests[3]), duplicateLogin, productDuplicateLogin);

  await devtools.evaluate(`(() => {
    document.querySelectorAll('span.telemetrics_click').forEach((element) => element.remove());
    const valid = document.createElement('span');
    valid.className = 'telemetrics_click';
    valid.dataset.tag = 'production-build-tag';
    document.querySelector('app-root').appendChild(valid);
    document.querySelectorAll('canvas.analytics_stage').forEach((element) => element.remove());
    const validCanvas = document.createElement('canvas');
    validCanvas.className = 'analytics_stage';
    validCanvas.dataset.view = 'production-view-2026.11';
    document.querySelector('app-root').appendChild(validCanvas);
  })()`);
  await click(1, 5);
  const registerHeaders = headersOf(requests[4]);
  assertRequest(registerHeaders, validRegister, productValidRegister);
  const wasmRequests = networkUrls.filter((url) => new URL(url).pathname.endsWith('.wasm'));
  console.log(`Browser check: validating ${packageVariant} package network behavior.`);
  assert.deepEqual(wasmRequests, [], `Unexpected Wasm requests: ${wasmRequests.join(', ')}`);
  assert.equal(requests.length, 5, 'Exactly five API requests are expected');
  assert.deepEqual(
    networkUrls.filter((url) => /\/(?:collect|track|analytics)(?:[/?]|$)/.test(new URL(url).pathname)),
    [],
    'Packages must not create additional analytics requests',
  );
  if (packageVariant === 'embedded') {
    assert.deepEqual(deferredScriptRequests(), [], 'embedded package must not request a separate runtime chunk');
  } else {
    assert.equal(deferredScriptRequests().length, 1, 'lazy runtime chunk must load exactly once for all submissions');
  }
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  console.log('Browser check passed: Angular + real Wasm, valid/missing/empty/duplicate DOM, login/register, headers and generic 403.');
} finally {
  clearTimeout(watchdog);
  socket?.close();
  chromeProcess.kill();
  await new Promise((resolveClose) => server.close(resolveClose));
  console.log('Browser check: resources released.');
}
