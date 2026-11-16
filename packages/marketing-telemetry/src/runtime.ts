import type { PixelRuntime, RuntimeLoader } from './types.js';

/**
 * Loads the generated web-target module and initializes its Wasm bytes.
 *
 * The explicit URL keeps the asset name independent from generated JavaScript
 * and allows Angular to serve `pixel.wasm` from its configured asset directory.
 */
export const loadPixelRuntime: RuntimeLoader = async (pixelUrl) => {
  // Generated wasm-bindgen glue is produced by `npm run build:wasm`.
  const generated = await import('../pkg/funnel_wasm.js');
  await generated.default({ module_or_path: pixelUrl });
  return {
    calculate_funnel_score: generated.calculate_funnel_score,
  };
};

/** Coordinates lazy initialization for all consumers of one pixel asset. */
export class RuntimeGate {
  /** Shared fulfilled or in-flight initialization; cleared after rejection. */
  private pending?: Promise<PixelRuntime>;

  /** Stores the asset URL and replaceable external loading boundary. */
  constructor(
    private readonly pixelUrl: string,
    private readonly loader: RuntimeLoader = loadPixelRuntime,
  ) {}

  /**
   * Returns the same promise for concurrent callers.
   *
   * A rejection clears the shared state so a later submission can retry.
   */
  acquire(): Promise<PixelRuntime> {
    if (this.pending === undefined) {
      const attempt = this.loader(this.pixelUrl).catch((error: unknown) => {
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
