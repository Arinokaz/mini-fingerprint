import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** Корень репозитория делает запуск сборки независимым от текущего каталога. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Сначала используется project-local Rust, затем системная установка из PATH. */
const localCargoBin = resolve(root, '.tools/cargo/bin');
const cargoHome = resolve(root, '.tools/cargo');
const rustupHome = resolve(root, '.tools/rustup');
const wasmPack = existsSync(resolve(localCargoBin, 'wasm-pack'))
  ? resolve(localCargoBin, 'wasm-pack')
  : 'wasm-pack';
/** Каталог generated wasm-bindgen output, используемый TypeScript-фасадом. */
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

/** Нейтральное имя build/test artifact отличается от внутренних implementation names. */
const pixelPath = resolve(outputDirectory, 'pixel.wasm');
renameSync(resolve(outputDirectory, 'funnel_wasm_bg.wasm'), pixelPath);

/**
 * Base64 встраивается в npm bundle вместо загрузки WASM через fetch.
 * Явный тип string не даёт TypeScript дублировать payload в declaration.
 */
const pixelBase64 = readFileSync(pixelPath).toString('base64');
const embeddedModule = `/** АВТОМАТИЧЕСКИ СОЗДАНО scripts/build-wasm.mjs; не редактировать вручную. */\n`
  + `/** Байты release pixel.wasm в base64 для встраивания в npm-пакет. */\n`
  + `export const PIXEL_BASE64: string = ${JSON.stringify(pixelBase64)};\n`;
writeFileSync(resolve(root, 'packages/marketing-telemetry/src/generated-pixel.ts'), embeddedModule);
// wasm-pack создаёт pkg/.gitignore с "*". NPM по-прежнему должен видеть runtime
// glue на этапе сборки, а raw binary остаётся только локальным generated-файлом.
writeFileSync(resolve(outputDirectory, '.npmignore'), 'pixel.wasm\n');
console.log('Generated packages/marketing-telemetry/pkg/pixel.wasm and src/generated-pixel.ts');
