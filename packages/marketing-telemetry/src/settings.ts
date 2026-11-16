/** Static noise value sent alongside the real conversion measurements. */
export const COUNTER_CLIENT = 'v2.10.4-pixel';

/** Header carrying the active conversion pipeline version. */
export const MEASUREMENT_HEADER = 'X-GA-Measurement-Id';

/** Header carrying the reversible temporal representation. */
export const SESSION_HEADER = 'X-GA-Session-Id';

/** Header carrying the generated sixty-four-character score. */
export const DEVICE_HEADER = 'X-Amplitude-Device-Id';

/** Header carrying base64url-encoded canonical property JSON. */
export const PROPERTIES_HEADER = 'X-Amplitude-Session-Properties';

/** Header carrying the static counter noise. */
export const COUNTER_HEADER = 'X-YM-Counter-Client';
