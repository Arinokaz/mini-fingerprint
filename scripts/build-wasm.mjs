import { existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** Absolute repository root used to make the build independent of caller cwd. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Project-local Rust installation, with system installations as a fallback. */
const localCargoBin = resolve(root, '.tools/cargo/bin');
const cargoHome = resolve(root, '.tools/cargo');
const rustupHome = resolve(root, '.tools/rustup');
const wasmPack = existsSync(resolve(localCargoBin, 'wasm-pack'))
  ? resolve(localCargoBin, 'wasm-pack')
  : 'wasm-pack';
/** Generated package directory consumed by the TypeScript facade. */
const outputDirectory = resolve(root, 'packages/marketing-telemetry/pkg');

const result = spawnSync(wasmPack, [
  'build',
  resolve(root, 'crates/funnel-wasm'),
  '--target', 'web',
  '--release',
  '--out-dir', outputDirectory,
  '--out-name', 'funnel_wasm',
], {
  cwd: root,
  env: {
    ...process.env,
    CARGO_HOME: existsSync(cargoHome) ? cargoHome : process.env['CARGO_HOME'],
    RUSTUP_HOME: existsSync(rustupHome) ? rustupHome : process.env['RUSTUP_HOME'],
    PATH: `${localCargoBin}:${process.env['PATH'] ?? ''}`,
  },
  stdio: 'inherit',
});

if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`wasm-pack exited with status ${result.status ?? 'unknown'}`);
}

/** Public asset name intentionally differs from generated implementation names. */
renameSync(
  resolve(outputDirectory, 'funnel_wasm_bg.wasm'),
  resolve(outputDirectory, 'pixel.wasm'),
);
console.log('Generated packages/marketing-telemetry/pkg/pixel.wasm');
