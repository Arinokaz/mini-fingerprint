import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root derived from this script, independent of the npm workspace cwd. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Existing artifact produced by `npm run build:wasm`; nothing is downloaded here. */
const source = resolve(root, 'packages/marketing-telemetry/pkg/pixel.wasm');
/** Angular-owned public directory copied into the browser build. */
const destinationDirectory = resolve(root, 'apps/demo-web/public/assets/telemetry');
const destination = resolve(destinationDirectory, 'pixel.wasm');

mkdirSync(destinationDirectory, { recursive: true });
copyFileSync(source, destination);
console.log('Prepared apps/demo-web/public/assets/telemetry/pixel.wasm');
