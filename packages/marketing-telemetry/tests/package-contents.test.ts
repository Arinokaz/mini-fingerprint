import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertNeutralArtifact } from '../scripts/artifact-rules.mjs';

test('NPM tarball contains only the minified embedded runtime and declarations', () => {
  const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageDirectory,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' },
  });

  assert.equal(result.status, 0, result.stderr);
  const [report] = JSON.parse(result.stdout);
  const paths = report.files.map((file: { path: string }) => file.path);
  assert.ok(paths.includes('dist/index.js'), 'compiled facade is required');
  assert.ok(paths.includes('dist/index.d.ts'), 'facade declarations are required');
  assert.ok(!paths.some((path: string) => path.startsWith('pkg/')), 'generated glue must be bundled');
  assert.ok(!paths.some((path: string) => /^(?:src|docs|crates)\//.test(path)), 'sources and docs must stay out');
  assert.ok(!paths.some((path: string) => /\.(?:wasm|map)$/.test(path)), 'raw Wasm and source maps must stay out');

  const javascript = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');
  const declarations = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
  assert.match(javascript, /["'][A-Za-z0-9+/=]{512,}["']/, 'embedded base64 payload is required');
  assert.match(javascript, /\bTelemetrySdk\b/, 'the public class export must remain stable');
  assert.ok(!javascript.includes('pixel-'), 'embedded build must not reference a separate pixel chunk');
  assertNeutralArtifact(javascript, 'dist/index.js');
  assertNeutralArtifact(declarations, 'dist/index.d.ts');
});
