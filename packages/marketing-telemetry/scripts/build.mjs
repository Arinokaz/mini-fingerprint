/**
 * Собирает declarations и минифицированный browser ESM для одного варианта пакета.
 * Скрипт не компилирует Rust: generated pkg/ и generated-pixel.ts уже должны существовать.
 */
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
if (variant !== 'embedded' && variant !== 'lazy') {
  throw new Error(`Unsupported package variant: ${variant}`);
}
const outDir = resolve(packageRoot, outDirOption);
// Очистка разрешена только для generated-каталогов внутри текущего репозитория.
const relativeOutput = relative(repositoryRoot, outDir);
if (relativeOutput === '' || relativeOutput.startsWith('..') || isAbsolute(relativeOutput)) {
  throw new Error('Package output must stay inside the repository.');
}

rmSync(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
// TypeScript создаёт только declarations; рабочий JS далее собирает esbuild.
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

const options = {
  absWorkingDir: packageRoot,
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  external: ['@angular/*', 'rxjs', 'rxjs/*'],
};
if (variant === 'lazy') {
  // Dynamic import pixel-runtime становится единственным content-hashed chunk.
  await build({
    ...options,
    outdir: outDir,
    entryNames: 'index',
    splitting: true,
    chunkNames: 'pixel-[hash]',
  });
} else {
  await build({ ...options, outfile: resolve(outDir, 'index.js') });
}

for (const file of readdirSync(outDir)) {
  if (file.endsWith('.js') || file.endsWith('.d.ts')) {
    assertNeutralArtifact(readFileSync(resolve(outDir, file), 'utf8'), file);
  }
}
