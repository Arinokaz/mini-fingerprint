import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const releaseRoot = resolve(repositoryRoot, 'release');
const stagingRoot = resolve(releaseRoot, 'staging');
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const baseName = `company-marketing-telemetry-${manifest.version}`;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' },
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function fileSize(path) {
  const bytes = readFileSync(path);
  return {
    path: `dist/${basename(path)}`,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes, { level: 9 }).length,
  };
}

rmSync(stagingRoot, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });
const report = {
  rawWasmBytes: readFileSync(resolve(packageRoot, 'pkg/pixel.wasm')).length,
  base64Bytes: readFileSync(resolve(packageRoot, 'pkg/pixel.wasm')).toString('base64').length,
  variants: {},
};

for (const variant of ['embedded', 'lazy']) {
  const staging = resolve(stagingRoot, variant);
  const outDir = resolve(staging, 'dist');
  await mkdir(staging, { recursive: true });
  run(process.execPath, [
    resolve(packageRoot, 'scripts/build.mjs'),
    '--variant', variant,
    '--out-dir', outDir,
  ]);

  const releaseManifest = {
    name: manifest.name,
    version: manifest.version,
    private: true,
    type: 'module',
    description: manifest.description,
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: manifest.exports,
    files: ['dist'],
    sideEffects: false,
  };
  writeFileSync(resolve(staging, 'package.json'), `${JSON.stringify(releaseManifest, null, 2)}\n`);

  const packed = JSON.parse(run('npm', [
    'pack', staging,
    '--pack-destination', releaseRoot,
    '--ignore-scripts',
    '--json',
  ]));
  const originalArchive = resolve(releaseRoot, packed[0].filename);
  const archive = resolve(releaseRoot, `${baseName}-${variant}.tgz`);
  rmSync(archive, { force: true });
  renameSync(originalArchive, archive);

  const files = readdirSync(outDir)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => fileSize(resolve(outDir, file)));
  report.variants[variant] = { archive, files };
  console.log(`${variant}: ${files.map((file) => `${file.path}=${file.bytes} bytes`).join(', ')}`);
}

writeFileSync(resolve(releaseRoot, 'size-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Release archives and size report written to ${releaseRoot}`);
