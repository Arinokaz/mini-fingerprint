import { RuntimeGate, loadPixelRuntime } from './runtime.js';
import {
  COUNTER_CLIENT,
  COUNTER_HEADER,
  DEVICE_HEADER,
  MEASUREMENT_HEADER,
  PROPERTIES_HEADER,
  SESSION_HEADER,
} from './settings.js';
import type {
  ConversionPayload,
  ConversionProperty,
  PixelRuntime,
  RuntimeLoader,
} from './types.js';

/** Public marketing-style facade hiding browser and Wasm integration details. */
export class TelemetrySdk {
  /** Lazy initializer shared by every submission made through this instance. */
  private readonly runtime: RuntimeGate;

  /** Creates an embedded-runtime facade; the optional loader supports TS tests. */
  constructor(loader: RuntimeLoader = loadPixelRuntime) {
    this.runtime = new RuntimeGate(loader);
  }

  /** Generates camouflaged headers immediately before an API submission. */
  async getConversionHeaders(
    actionPath: string,
    properties: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    // Object entries preserve the caller's data without introducing timestamps.
    const inputPairs = Object.entries(properties);
    const runtime = await this.runtime.acquire();
    const rawPayload = runtime.calculate_funnel_score(actionPath, JSON.stringify(inputPairs));
    const payload = readPayload(rawPayload);
    const propertyJson = JSON.stringify(payload.properties);

    return {
      [MEASUREMENT_HEADER]: payload.profile,
      [SESSION_HEADER]: payload.pulse,
      [DEVICE_HEADER]: payload.score,
      [PROPERTIES_HEADER]: encodeBase64Url(propertyJson),
      [COUNTER_HEADER]: COUNTER_CLIENT,
    };
  }
}

/** Parses and validates the complete runtime response before header creation. */
function readPayload(raw: string): ConversionPayload {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new Error('Invalid runtime response: malformed JSON');
  }

  if (!isPayload(candidate)) {
    throw new Error('Invalid runtime response: inconsistent fields');
  }
  return candidate;
}

/** Checks every field consumed by the facade, including nested pair values. */
function isPayload(candidate: unknown): candidate is ConversionPayload {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const value = candidate as Record<string, unknown>;
  return value['profile'] === 'cv1'
    && typeof value['pulse'] === 'string'
    && /^[0-9a-f]{16}$/.test(value['pulse'])
    && typeof value['score'] === 'string'
    && /^[0-9a-f]{64}$/.test(value['score'])
    && Array.isArray(value['properties'])
    && value['properties'].every(isProperty);
}

/** Checks one canonical `[name, value]` tuple from the runtime response. */
function isProperty(candidate: unknown): candidate is ConversionProperty {
  return Array.isArray(candidate)
    && candidate.length === 2
    && typeof candidate[0] === 'string'
    && typeof candidate[1] === 'string';
}

/** Encodes UTF-8 JSON with base64url and removes all trailing padding. */
function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// Keep this type import referenced in generated declarations for loader consumers.
export type { PixelRuntime };
