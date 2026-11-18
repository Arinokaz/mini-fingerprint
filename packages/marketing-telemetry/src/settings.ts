/** Статическое telemetry-значение, передаваемое в отдельном заголовке. */
export const COUNTER_CLIENT = 'v2.10.4-pixel';

/** Заголовок с версией активного conversion-контракта. */
export const MEASUREMENT_HEADER = 'X-GA-Measurement-Id';

/** Заголовок с обратимым представлением выбранного временного окна. */
export const SESSION_HEADER = 'X-GA-Session-Id';

/** Заголовок с итоговым 64-символьным hex-результатом вычислений. */
export const DEVICE_HEADER = 'X-Amplitude-Device-Id';

/** Заголовок с каноническим JSON свойств в base64url без padding. */
export const PROPERTIES_HEADER = 'X-Amplitude-Session-Properties';

/** Заголовок со статическим значением `COUNTER_CLIENT`. */
export const COUNTER_HEADER = 'X-YM-Counter-Client';
