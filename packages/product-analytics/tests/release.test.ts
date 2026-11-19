import '@angular/compiler';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { before } from 'node:test';
import { assertNeutralArtifact } from '../scripts/artifact-rules.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const releaseRoot = resolve(packageRoot, '../../release');
const archive = resolve(releaseRoot, 'company-product-analytics-0.1.0.tgz');

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

before(() => {
  run('npm', ['run', 'build:release']);
});

test('scanner отклоняет раскрывающие термины, но игнорирует payload literals', () => {
  assert.doesNotThrow(() => assertNeutralArtifact(`const payload="${'A'.repeat(600)}riskhuman";`, 'payload.js'));
  for (const source of ['const risk = 1;', 'const human = true;', 'headless();', 'getRandomValues();']) {
    assert.throws(() => assertNeutralArtifact(source, 'revealing.js'));
  }
});

test('npm archive содержит только минифицированный dist без исходников и maps', () => {
  const paths = run('tar', ['-tzf', archive]).trim().split('\n').filter(Boolean);
  assert.ok(paths.includes('package/dist/index.js'));
  assert.ok(paths.includes('package/dist/index.d.ts'));
  assert.ok(!paths.some((path) => /^(?:package\/)?(?:src|tests|docs)\//.test(path)));
  assert.ok(!paths.some((path) => /\.(?:map|wasm)$/.test(path)));
  for (const path of paths.filter((path) => /\.(?:js|d\.ts)$/.test(path))) {
    assertNeutralArtifact(run('tar', ['-xOf', archive, path]), path);
  }
});

test('built pa1 воспроизводит golden headers и соблюдает size budget', async () => {
  const fixture = JSON.parse(readFileSync(resolve(packageRoot, '../../tests/fixtures/product-analytics-v1.json'), 'utf8'));
  const testCase = fixture.cases.find((candidate: { name: string }) => candidate.name === 'login-production-missing');
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalPerformanceNow = performance.now;
  try {
    Date.now = () => testCase.timestamp * 1000;
    Math.random = () => 0;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => 0 });
    const { ProductAnalytics } = await import(pathToFileURL(resolve(packageRoot, 'dist/index.js')).href);
    const sdk = new ProductAnalytics();
    await sdk.getEngagementHeaders(testCase.actionPath);
    const headers = await sdk.getEngagementHeaders(testCase.actionPath);
    assert.equal(headers['X-PA-Measurement-Id'], 'pa1');
    assert.equal(headers['X-PA-Session-Id'], testCase.pulse);
    assert.equal(headers['X-PA-Device-Id'], testCase.score);
    assert.equal(headers['X-PA-Event-Id'], testCase.eventId);
    assert.ok(headers['X-PA-Session-Properties'].length <= 1400);
    assert.ok(Buffer.byteLength(JSON.stringify(headers), 'utf8') <= 2048);
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    Object.defineProperty(performance, 'now', { configurable: true, value: originalPerformanceNow });
  }
});
