import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = resolve(tmpdir(), 'opencode');
const manifest = JSON.parse(await readFile(resolve(root, 'packages/marketing-telemetry/package.json'), 'utf8'));
const baseName = `company-marketing-telemetry-${manifest.version}`;
await mkdir(temporaryRoot, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  assert.equal(result.status, 0, `${command} ${args.join(' ')} exited with ${result.status ?? 'unknown'}`);
}

for (const variant of ['embedded', 'lazy']) {
  const archive = resolve(root, 'release', `${baseName}-${variant}.tgz`);
  assert.ok(existsSync(archive), `Build the npm variants first: missing ${archive}`);
  const temporary = await mkdtemp(resolve(temporaryRoot, `telemetry-${variant}-`));
  try {
    const demo = resolve(temporary, 'demo-web');
    await mkdir(demo, { recursive: true });
    await cp(resolve(root, 'apps/demo-web'), demo, {
      recursive: true,
      filter: (source) => !/(?:^|[\\/])(?:dist|node_modules|\.angular)(?:[\\/]|$)/.test(source),
    });
    const demoManifestPath = resolve(demo, 'package.json');
    const demoManifest = JSON.parse(await readFile(demoManifestPath, 'utf8'));
    demoManifest.dependencies['@company/marketing-telemetry'] = archive;
    await writeFile(demoManifestPath, `${JSON.stringify(demoManifest, null, 2)}\n`);

    console.log(`Angular ${variant}: installing the actual archive in ${demo}`);
    run('npm', ['install'], { cwd: demo });
    run('npm', ['run', 'build', '--', '--configuration=production'], { cwd: demo });
    run(process.execPath, [resolve(root, 'scripts/check-browser.mjs')], {
      cwd: root,
      env: {
        ...process.env,
        DEMO_BROWSER_ROOT: resolve(demo, 'dist/demo-web/browser'),
        TELEMETRY_VARIANT: variant,
      },
    });
    console.log(`Angular ${variant}: packed archive passed production and browser checks.`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
