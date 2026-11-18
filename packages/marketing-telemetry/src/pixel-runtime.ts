import initialize, { calculate_funnel_score } from '../pkg/funnel_wasm.js';
import { PIXEL_BASE64 } from './generated-pixel.js';
import type { PixelRuntime } from './types.js';

/**
 * Инициализирует WebAssembly из base64, встроенного в npm-пакет.
 *
 * Generated glue и base64 импортируются именно в этом модуле, чтобы сборщик
 * мог либо встроить их в index.js, либо вынести в lazy chunk целиком.
 */
export async function instantiatePixelRuntime(): Promise<PixelRuntime> {
  // BufferSource не является URL, поэтому wasm-bindgen не вызывает fetch.
  await initialize({ module_or_path: decodeBase64(PIXEL_BASE64) });
  return { calculate_funnel_score };
}

/**
 * Преобразует ASCII base64 в байты, принимаемые WebAssembly.instantiate.
 * Результат является бинарным представлением модуля, а не расшифровкой.
 */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
