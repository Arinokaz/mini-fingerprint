import { RuntimeGate, loadPixelRuntime } from './runtime.js';
import {
  COUNTER_CLIENT,
  DEFAULT_SCORE_PREFIX,
  MEASUREMENT_HEADER,
  PROPERTIES_HEADER,
  SESSION_HEADER,
} from './settings.js';
import type {
  ConversionPayload,
  ConversionProperty,
  PixelRuntime,
  RuntimeLoader,
  TelemetrySettings,
} from './types.js';

/**
 * Публичный marketing-style фасад, скрывающий браузерную и WASM-интеграцию.
 *
 * Экземпляр хранит собственный RuntimeGate: повторная инициализация исключается
 * в пределах этого экземпляра, а не глобально для всего приложения.
 */
export class TelemetrySdk {
  /** Общий lazy initializer для всех запросов через этот экземпляр фасада. */
  private readonly runtime: RuntimeGate;

  /** Неизменяемая настройка отбора результата для этого экземпляра. */
  private readonly scorePrefix: string;
  /** Публичный project identifier, проверяемый перед генерацией. */
  private readonly measurementId: string | undefined;

  /** Создаёт фасад с настройками и необязательным loader для тестов. */
  constructor(settings: TelemetrySettings = {}, loader: RuntimeLoader = loadPixelRuntime) {
    this.measurementId = settings.measurementId;
    const scorePrefix = settings.conversion?.scorePrefix ?? DEFAULT_SCORE_PREFIX;
    if (!/^0{0,3}$/.test(scorePrefix)) {
      throw new Error('Unsupported scorePrefix');
    }
    this.scorePrefix = scorePrefix;
    this.runtime = new RuntimeGate(loader);
  }

  /**
   * Формирует telemetry-заголовки непосредственно перед API-запросом.
   *
   * @param actionPath Абсолютный API-путь, который участвует в вычислении cv2.
   * @param properties Дополнительные строковые свойства; порядок результата
   * определяется последующей канонической сортировкой Rust.
   * @returns Полный набор заголовков для объединения с заголовками HTTP-запроса.
   */
  async getConversionHeaders(
    actionPath: string,
    properties: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    if (typeof this.measurementId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(this.measurementId)) {
      throw new Error('Invalid measurementId');
    }
    // На границу WASM свойства передаются массивом пар, а не JSON-объектом.
    const inputPairs = Object.entries(properties);
    const runtime = await this.runtime.acquire();
    const rawPayload = runtime.calculate_funnel_score(
      actionPath,
      JSON.stringify(inputPairs),
      this.scorePrefix,
    );
    const payload = readPayload(rawPayload);
    return {
      [MEASUREMENT_HEADER]: this.measurementId,
      [SESSION_HEADER]: payload.pulse,
      [PROPERTIES_HEADER]: encodeConversionEnvelope(payload),
    };
  }
}

/** Кодирует проверенный cv2 payload в canonical event envelope. */
export function encodeConversionEnvelope(payload: ConversionPayload): string {
  return encodeBase64Url(JSON.stringify({
    client: COUNTER_CLIENT,
    eid: payload.clickId,
    props: payload.properties,
    sum: payload.score,
    v: payload.profile,
  }));
}

/**
 * Разбирает и валидирует полный ответ runtime до создания заголовков.
 * Любая ошибка отклоняет Promise: частичный или непроверенный результат не возвращается.
 */
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

/**
 * Проверяет все поля ответа WASM, включая вложенные пары свойств.
 * Type guard одновременно доказывает TypeScript, что candidate имеет ConversionPayload.
 */
function isPayload(candidate: unknown): candidate is ConversionPayload {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const value = candidate as Record<string, unknown>;
  return value['profile'] === 'cv2'
    && typeof value['clickId'] === 'string'
    && /^[0-9a-f]{32}$/.test(value['clickId'])
    && typeof value['pulse'] === 'string'
    && /^[0-9a-f]{16}$/.test(value['pulse'])
    && typeof value['score'] === 'string'
    && /^[0-9a-f]{64}$/.test(value['score'])
    && Array.isArray(value['properties'])
    && value['properties'].every(isProperty);
}

/** Проверяет, что свойство является кортежем ровно из двух строк. */
function isProperty(candidate: unknown): candidate is ConversionProperty {
  return Array.isArray(candidate)
    && candidate.length === 2
    && typeof candidate[0] === 'string'
    && typeof candidate[1] === 'string';
}

/**
 * Кодирует UTF-8 JSON как base64url и удаляет завершающий padding.
 * Это транспортное кодирование, а не шифрование свойств.
 */
function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// Сохраняет тип в generated declarations для потребителей loader-контракта.
export type { PixelRuntime };
