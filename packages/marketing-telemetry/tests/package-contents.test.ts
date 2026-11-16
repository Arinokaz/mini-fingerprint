import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('NPM tarball contains runtime glue and declarations but no raw Wasm file', () => {
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
  assert.ok(paths.includes('pkg/funnel_wasm.js'), 'generated runtime glue is required');
  assert.ok(paths.includes('pkg/funnel_wasm.d.ts'), 'generated declarations are required');
  assert.ok(paths.includes('pkg/funnel_wasm_bg.wasm.d.ts'), 'Wasm declarations are required');
  assert.ok(!paths.some((path: string) => path.endsWith('.wasm')), `raw Wasm was packed: ${paths.join(', ')}`);
});
