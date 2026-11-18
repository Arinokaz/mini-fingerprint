/**
 * Публичная точка входа локального marketing telemetry пакета.
 *
 * Наружу передаются только фасад и тип loader. Детали WASM, generated glue
 * и внутреннее состояние инициализации остаются внутри пакета.
 */
export { TelemetrySdk } from './conversion.js';
export type { RuntimeLoader } from './types.js';
