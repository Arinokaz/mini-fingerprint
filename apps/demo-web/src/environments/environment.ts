/** Production-like defaults replaced explicitly for local development/staging. */
export const environment = {
  /** Public location of the generated Wasm asset. */
  pixelUrl: '/assets/telemetry/pixel.wasm',
  /** Expected DOM value for this build; PHP configuration is set independently. */
  touchpoint: 'production-build-tag',
};
