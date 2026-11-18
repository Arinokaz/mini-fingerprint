import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { before } from 'node:test';
import { assertNeutralArtifact } from '../scripts/artifact-rules.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const releaseRoot = resolve(packageRoot, '../../release');
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const baseName = `company-marketing-telemetry-${manifest.version}`;
const embeddedArchive = resolve(releaseRoot, `${baseName}-embedded.tgz`);
const lazyArchive = resolve(releaseRoot, `${baseName}-lazy.tgz`);
const payloadPattern = /["'][A-Za-z0-9+/=]{512,}["']/g;

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function archivePaths(archive: string): string[] {
  return run('tar', ['-tzf', archive]).trim().split('\n').filter(Boolean);
}

function archiveText(archive: string, path: string): string {
  return run('tar', ['-xOf', archive, path]);
}

before(() => {
  run('npm', ['run', 'build:release']);
});

test('artifact scanner ignores payload accidents but rejects revealing code', () => {
  const payload = `${'A'.repeat(600)}token`;
  assert.doesNotThrow(() => assertNeutralArtifact(`const payload="${payload}";`, 'payload.js'));
  for (const revealing of ['const security = true;', 'const clientSecret = 1;', 'authorizationHeader();', 'securityFlag = false;']) {
    assert.throws(
      () => assertNeutralArtifact(revealing, 'revealing.js'),
      /sensitive implementation terminology/,
    );
  }
});

test('release archives contain separate embedded and lazy layouts without sources', () => {
  for (const archive of [embeddedArchive, lazyArchive]) {
    assert.ok(existsSync(archive), `Missing ${basename(archive)}`);
    const paths = archivePaths(archive);
    assert.ok(paths.includes('package/dist/index.js'));
    assert.ok(paths.includes('package/dist/index.d.ts'));
    assert.ok(!paths.some((path) => /^(?:package\/)?(?:src|pkg|docs|crates)\//.test(path)));
    assert.ok(!paths.some((path) => /\.(?:wasm|map)$/.test(path)));
    assert.ok(!paths.includes('package/size-report.json'));
  }
  const embeddedPaths = archivePaths(embeddedArchive);
  const lazyPaths = archivePaths(lazyArchive);
  assert.ok(!embeddedPaths.some((path) => /pixel-[A-Z0-9]+\.js$/.test(path)));
  assert.equal(lazyPaths.filter((path) => /pixel-[A-Z0-9]+\.js$/.test(path)).length, 1);
});

test('release JavaScript is neutral and stores the base64 payload exactly once', () => {
  for (const archive of [embeddedArchive, lazyArchive]) {
    for (const path of archivePaths(archive).filter((path) => /\.(?:js|d\.ts)$/.test(path))) {
      assertNeutralArtifact(archiveText(archive, path), path);
    }
  }
  const embeddedTextPaths = archivePaths(embeddedArchive).filter((path) => /\.(?:js|d\.ts)$/.test(path));
  const embeddedPayloadPaths = embeddedTextPaths.filter(
    (path) => (archiveText(embeddedArchive, path).match(payloadPattern) ?? []).length > 0,
  );
  assert.deepEqual(embeddedPayloadPaths, ['package/dist/index.js']);

  const lazyEntry = archiveText(lazyArchive, 'package/dist/index.js');
  const lazyChunkPath = archivePaths(lazyArchive).find((path) => /pixel-[A-Z0-9]+\.js$/.test(path));
  assert.ok(lazyChunkPath);
  const lazyTextPaths = archivePaths(lazyArchive).filter((path) => /\.(?:js|d\.ts)$/.test(path));
  const lazyPayloadPaths = lazyTextPaths.filter(
    (path) => (archiveText(lazyArchive, path).match(payloadPattern) ?? []).length > 0,
  );
  assert.deepEqual(lazyPayloadPaths, [lazyChunkPath]);
  assert.ok(lazyEntry.length < archiveText(embeddedArchive, 'package/dist/index.js').length);
});

test('size report measures raw Wasm, base64 and every variant file', () => {
  const report = JSON.parse(readFileSync(resolve(releaseRoot, 'size-report.json'), 'utf8'));
  assert.ok(Number.isSafeInteger(report.rawWasmBytes) && report.rawWasmBytes > 0);
  assert.ok(Number.isSafeInteger(report.base64Bytes) && report.base64Bytes > report.rawWasmBytes);
  for (const variant of ['embedded', 'lazy']) {
    assert.ok(Array.isArray(report.variants[variant].files));
    assert.ok(report.variants[variant].files.length > 0);
    for (const file of report.variants[variant].files) {
      assert.ok(typeof file.path === 'string');
      assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
      assert.ok(Number.isSafeInteger(file.gzipBytes) && file.gzipBytes > 0);
    }
  }
});

test('both built variants reproduce the same golden headers and initialize on demand', async () => {
  const fixture = JSON.parse(readFileSync(resolve(packageRoot, '../../tests/fixtures/conversion-v1.json'), 'utf8'));
  const testCase = fixture.cases.find((candidate: { name: string }) => candidate.name === 'login-missing-anchor');
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const originalAtob = globalThis.atob;
  let decodes = 0;
  const results = [];
  try {
    Date.now = () => testCase.now * 1000;
    globalThis.fetch = async () => {
      throw new Error('Built packages must not fetch a Wasm asset');
    };
    globalThis.atob = (value: string) => {
      decodes += 1;
      return originalAtob(value);
    };
    for (const variant of ['embedded', 'lazy']) {
      const entry = resolve(releaseRoot, 'staging', variant, 'dist/index.js');
      const { TelemetrySdk } = await import(pathToFileURL(entry).href);
      assert.equal(decodes, 0, `${variant}: import must not initialize the runtime`);
      const sdk = new TelemetrySdk();
      const [first, second] = await Promise.all([
        sdk.getConversionHeaders(testCase.journey, Object.fromEntries(testCase.inputProperties)),
        sdk.getConversionHeaders(testCase.journey, Object.fromEntries(testCase.inputProperties)),
      ]);
      assert.deepEqual(first, second);
      assert.equal(first['X-GA-Measurement-Id'], 'cv1');
      assert.equal(first['X-GA-Session-Id'], testCase.pulse);
      assert.equal(first['X-Amplitude-Device-Id'], testCase.score);
      assert.equal(decodes, 1, `${variant}: concurrent calls must share initialization`);
      results.push(first);
      decodes = 0;
    }
    assert.deepEqual(results[0], results[1]);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    globalThis.atob = originalAtob;
  }
});
