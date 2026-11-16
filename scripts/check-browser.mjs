import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// WSL cannot reliably reach a Windows browser's loopback DevTools socket.
// Reuse an existing Windows Node.js when present; no packages are downloaded.
const windowsNode = '/mnt/c/Program Files/nodejs/node.exe';
if (process.platform === 'linux' && process.env['WSL_DISTRO_NAME'] && existsSync(windowsNode)) {
  const scriptPath = execFileSync('wslpath', ['-w', fileURLToPath(import.meta.url)], { encoding: 'utf8' }).trim();
  const result = spawnSync(windowsNode, [scriptPath], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

/** Repository root and production output under test. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserRoot = resolve(root, 'apps/demo-web/dist/demo-web/browser');
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
assert.ok(existsSync(resolve(browserRoot, 'index.html')), 'Build demo-web production before this check.');
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
    source: 'Date.now = () => 1700000000000;',
  });
  console.log(`Browser check: navigating to ${applicationUrl}`);
  await devtools.send('Page.navigate', { url: applicationUrl });
  console.log('Browser check: navigation command completed.');
  await waitFor(
    () => devtools.evaluate("document.readyState === 'complete' && document.querySelectorAll('button').length === 2"),
    'Angular page and controls',
  );

  /** Returns header lookup helpers with case-insensitive names. */
  const headersOf = (request) => Object.fromEntries(
    Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
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
  const validHeaders = headersOf(requests[0]);
  assert.equal(validHeaders['x-ga-measurement-id'], 'cv1');
  assert.match(validHeaders['x-ga-session-id'], /^[0-9a-f]{16}$/);
  assert.match(validHeaders['x-amplitude-device-id'], /^[0-9a-f]{64}$/);
  assert.equal(validHeaders['x-ym-counter-client'], 'v2.10.4-pixel');
  assert.deepEqual(
    JSON.parse(Buffer.from(validHeaders['x-amplitude-session-properties'], 'base64url').toString('utf8')),
    [['form', 'login']],
  );
  assert.ok(!Object.keys(validHeaders).includes('x-client-timestamp'));

  // Removing the only marker must still produce a request with a different score.
  await devtools.evaluate("document.querySelector('span.telemetrics_click').remove()");
  await click(0, 2);
  const missingHeaders = headersOf(requests[1]);
  assert.equal(missingHeaders['x-ga-session-id'], validHeaders['x-ga-session-id']);
  assert.notEqual(missingHeaders['x-amplitude-device-id'], validHeaders['x-amplitude-device-id']);

  // Empty and duplicate markers resolve to the same fallback and deterministic score.
  await devtools.evaluate(`(() => {
    const span = document.createElement('span');
    span.className = 'telemetrics_click';
    span.dataset.tag = '';
    document.querySelector('app-root').appendChild(span);
  })()`);
  await click(0, 3);
  assert.equal(headersOf(requests[2])['x-amplitude-device-id'], missingHeaders['x-amplitude-device-id']);

  await devtools.evaluate(`(() => {
    const second = document.createElement('span');
    second.className = 'telemetrics_click';
    second.dataset.tag = 'second-tag';
    document.querySelector('app-root').appendChild(second);
  })()`);
  await click(0, 4);
  assert.equal(headersOf(requests[3])['x-amplitude-device-id'], missingHeaders['x-amplitude-device-id']);

  await click(1, 5);
  assert.notEqual(headersOf(requests[4])['x-amplitude-device-id'], missingHeaders['x-amplitude-device-id']);
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  console.log('Browser check passed: Angular + real Wasm, valid/missing/empty/duplicate DOM, login/register, headers and generic 403.');
} finally {
  clearTimeout(watchdog);
  socket?.close();
  chromeProcess.kill();
  await new Promise((resolveClose) => server.close(resolveClose));
  console.log('Browser check: resources released.');
}
