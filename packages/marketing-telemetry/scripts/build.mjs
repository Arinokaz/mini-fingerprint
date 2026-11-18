import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { assertNeutralArtifact } from './artifact-rules.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');

function readOption(name, fallback) {
  const args = process.argv.slice(2);
  const separate = args.indexOf(`--${name}`);
  if (separate >= 0 && args[separate + 1] !== undefined) {
    return args[separate + 1];
  }
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

const variant = readOption('variant', 'embedded');
const outDirOption = readOption('out-dir', 'dist');
if (variant !== 'embedded') {
  throw new Error(`Unsupported package variant: ${variant}`);
}
const outDir = resolve(packageRoot, outDirOption);
const relativeOutput = relative(repositoryRoot, outDir);
if (relativeOutput === '' || relativeOutput.startsWith('..') || isAbsolute(relativeOutput)) {
  throw new Error('Package output must stay inside the repository.');
}

rmSync(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const declarations = spawnSync('tsc', [
  '-p', resolve(packageRoot, 'tsconfig.json'),
  '--emitDeclarationOnly',
  '--outDir', outDir,
], { cwd: packageRoot, stdio: 'inherit' });
if (declarations.error !== undefined) {
  throw declarations.error;
}
if (declarations.status !== 0) {
  throw new Error(`TypeScript declarations exited with status ${declarations.status ?? 'unknown'}`);
}

await build({
  absWorkingDir: packageRoot,
  entryPoints: ['src/index.ts'],
  outfile: resolve(outDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
});

for (const file of readdirSync(outDir)) {
  if (file.endsWith('.js') || file.endsWith('.d.ts')) {
    assertNeutralArtifact(readFileSync(resolve(outDir, file), 'utf8'), file);
  }
}
