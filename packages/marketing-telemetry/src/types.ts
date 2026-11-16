/** Minimal generated Wasm surface consumed by the TypeScript facade. */
export interface PixelRuntime {
  /** Executes the neutral Rust export and returns its JSON payload. */
  calculate_funnel_score(journey: string, propertiesJson: string): string;
}

/** Asynchronous boundary that initializes the embedded module without input. */
export type RuntimeLoader = () => Promise<PixelRuntime>;

/** Canonical string pair returned by the Rust property codec. */
export type ConversionProperty = [name: string, value: string];

/** Shape of the JSON payload returned from the Wasm entry point. */
export interface ConversionPayload {
  /** Version of the active conversion pipeline. */
  profile: string;
  /** Reversible encoded temporal window. */
  pulse: string;
  /** Sixty-four-character result forwarded unchanged to the server. */
  score: string;
  /** Canonical property pairs serialized into the telemetry header. */
  properties: ConversionProperty[];
}
