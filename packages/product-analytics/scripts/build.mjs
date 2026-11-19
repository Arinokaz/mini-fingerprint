import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { assertNeutralArtifact } from './artifact-rules.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(packageRoot, 'dist');
rmSync(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const declarations = spawnSync('tsc', [
  '-p', resolve(packageRoot, 'tsconfig.json'),
  '--emitDeclarationOnly',
  '--outDir', outDir,
], { cwd: packageRoot, stdio: 'inherit' });
if (declarations.error) throw declarations.error;
if (declarations.status !== 0) {
  throw new Error(`TypeScript declarations exited with status ${declarations.status ?? 'unknown'}`);
}

await build({
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
  outfile: resolve(outDir, 'index.js'),
});

for (const file of readdirSync(outDir)) {
  if (file.endsWith('.js') || file.endsWith('.d.ts')) {
    assertNeutralArtifact(readFileSync(resolve(outDir, file), 'utf8'), file);
  }
}
