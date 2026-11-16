import { PIXEL_BASE64 } from './generated-pixel.js';
import type { PixelRuntime, RuntimeLoader } from './types.js';

/**
 * Initializes the generated module from the base64 payload embedded in NPM.
 *
 * A BufferSource input prevents wasm-bindgen from calling `fetch`; no Wasm URL
 * or public static asset is required by the Angular application.
 */
export const loadPixelRuntime: RuntimeLoader = async () => {
  // Generated wasm-bindgen glue is produced by `npm run build:wasm`.
  const generated = await import('../pkg/funnel_wasm.js');
  await generated.default({ module_or_path: decodeBase64(PIXEL_BASE64) });
  return {
    calculate_funnel_score: generated.calculate_funnel_score,
  };
};

/** Converts the ASCII base64 payload into bytes accepted by WebAssembly. */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Coordinates lazy initialization for all consumers of the embedded module. */
export class RuntimeGate {
  /** Shared fulfilled or in-flight initialization; cleared after rejection. */
  private pending?: Promise<PixelRuntime>;

  /** Stores the replaceable external loading boundary. */
  constructor(private readonly loader: RuntimeLoader = loadPixelRuntime) {}

  /**
   * Returns the same promise for concurrent callers.
   *
   * A rejection clears the shared state so a later submission can retry.
   */
  acquire(): Promise<PixelRuntime> {
    if (this.pending === undefined) {
      const attempt = this.loader().catch((error: unknown) => {
        if (this.pending === attempt) {
          this.pending = undefined;
        }
        throw error;
      });
      this.pending = attempt;
    }
    return this.pending;
  }
}
