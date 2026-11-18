import initialize, { calculate_funnel_score } from '../pkg/funnel_wasm.js';
import { PIXEL_BASE64 } from './generated-pixel.js';
import type { PixelRuntime } from './types.js';

/** Initializes the generated module from the base64 payload embedded in NPM. */
export async function instantiatePixelRuntime(): Promise<PixelRuntime> {
  // A BufferSource input prevents wasm-bindgen from calling fetch for a Wasm URL.
  await initialize({ module_or_path: decodeBase64(PIXEL_BASE64) });
  return { calculate_funnel_score };
}

/** Converts the ASCII base64 payload into bytes accepted by WebAssembly. */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
