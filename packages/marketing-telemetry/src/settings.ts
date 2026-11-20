/** Статическое telemetry-значение, передаваемое внутри event envelope. */
export const COUNTER_CLIENT = 'v2.10.4-pixel';

/** Начальный необязательный объём поиска подходящего score. */
export const DEFAULT_SCORE_PREFIX = '00';

/** Заголовок с публичным идентификатором проекта. */
export const MEASUREMENT_HEADER = 'X-GA-Measurement-Id';

/** Заголовок с обратимым представлением точного Unix timestamp в секундах. */
export const SESSION_HEADER = 'X-GA-Session-Id';

/** Заголовок с каноническим event envelope в base64url без padding. */
export const PROPERTIES_HEADER = 'X-GA-Session-Properties';

/** Legacy headers удаляются при fail-open, но новый transport их не создаёт. */
export const DEVICE_HEADER = 'X-Amplitude-Device-Id';
export const EVENT_HEADER = 'X-Amplitude-Event-Id';
export const LEGACY_PROPERTIES_HEADER = 'X-Amplitude-Session-Properties';
export const COUNTER_HEADER = 'X-YM-Counter-Client';
