/** Версия независимого product analytics профиля внутри event envelope. */
export const ANALYTICS_PROFILE = 'pa1';
export const MEASUREMENT_HEADER = 'X-PA-Measurement-Id';
export const SESSION_HEADER = 'X-PA-Session-Id';
export const PROPERTIES_HEADER = 'X-PA-Session-Properties';
/** Legacy headers удаляются при fail-open, но новый transport их не создаёт. */
export const DEVICE_HEADER = 'X-PA-Device-Id';
export const EVENT_HEADER = 'X-PA-Event-Id';
export const UNRESOLVED_VIEW = 'analytics.unresolved.v1';
