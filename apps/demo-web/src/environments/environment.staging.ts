/** Staging values kept separate from local and production build markers. */
export const environment = {
  /** Staging URL of the generated Wasm asset. */
  pixelUrl: '/assets/telemetry/pixel.wasm',
  /** Marker expected by a future staging PHP configuration. */
  touchpoint: 'staging-build-tag',
};
