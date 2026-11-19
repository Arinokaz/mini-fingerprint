import { spawnSync } from 'node:child_process';
import { readFileSync, renameSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const releaseRoot = resolve(repositoryRoot, 'release');
const staging = resolve(releaseRoot, 'staging/product-analytics');
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

/** Запускает команду в корне и прекращает release при любой ошибке. */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'silent' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

rmSync(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
run(process.execPath, [resolve(packageRoot, 'scripts/build.mjs')]);
cpSync(resolve(packageRoot, 'dist'), resolve(staging, 'dist'), { recursive: true });

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
  peerDependencies: manifest.peerDependencies,
};
writeFileSync(resolve(staging, 'package.json'), `${JSON.stringify(releaseManifest, null, 2)}\n`);

const packed = JSON.parse(run('npm', [
  'pack', staging,
  '--pack-destination', releaseRoot,
  '--ignore-scripts',
  '--json',
]));
const originalArchive = resolve(releaseRoot, packed[0].filename);
const archive = resolve(releaseRoot, `company-product-analytics-${manifest.version}.tgz`);
if (originalArchive !== archive) {
  rmSync(archive, { force: true });
  renameSync(originalArchive, archive);
}

const bytes = readFileSync(resolve(packageRoot, 'dist/index.js'));
const report = {
  archive,
  files: [{
    path: 'dist/index.js',
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes, { level: 9 }).length,
  }],
};
writeFileSync(resolve(releaseRoot, 'product-analytics-size-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Product analytics release: ${archive}; index.js=${bytes.length} bytes`);
