import type { PixelRuntime, RuntimeLoader } from './types.js';

/** Loads the generated module only when the first conversion is requested. */
export const loadPixelRuntime: RuntimeLoader = async () => {
  const pixel = await import('./pixel-runtime.js');
  return pixel.instantiatePixelRuntime();
};

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
