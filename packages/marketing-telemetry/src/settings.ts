/** Статическое telemetry-значение, передаваемое в отдельном заголовке. */
export const COUNTER_CLIENT = 'v2.10.4-pixel';

/** Начальный необязательный объём поиска подходящего score. */
export const DEFAULT_SCORE_PREFIX = '00';

/** Заголовок с версией активного conversion-контракта. */
export const MEASUREMENT_HEADER = 'X-GA-Measurement-Id';

/** Заголовок с обратимым представлением точного Unix timestamp в секундах. */
export const SESSION_HEADER = 'X-GA-Session-Id';

/** Заголовок с итоговым 64-символьным hex-результатом вычислений. */
export const DEVICE_HEADER = 'X-Amplitude-Device-Id';

/** Заголовок с финальным 128-битным идентификатором события. */
export const EVENT_HEADER = 'X-Amplitude-Event-Id';

/** Заголовок с каноническим JSON свойств в base64url без padding. */
export const PROPERTIES_HEADER = 'X-Amplitude-Session-Properties';

/** Заголовок со статическим значением `COUNTER_CLIENT`. */
export const COUNTER_HEADER = 'X-YM-Counter-Client';
