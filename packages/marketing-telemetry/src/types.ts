/** Настройки публичного conversion-фасада. */
export interface TelemetrySettings {
  /** Публичный project/counter identifier текущего приложения. */
  measurementId?: string;
  conversion?: {
    /** От одного до трёх нулевых hex-символов; пустая строка отключает отбор. */
    scorePrefix?: string;
  };
}

/** Минимальная поверхность generated WASM, необходимая TypeScript-фасаду. */
export interface PixelRuntime {
  /** Выполняет вычисление cv2 и возвращает результат в виде JSON-строки. */
  calculate_funnel_score(journey: string, propertiesJson: string, scorePrefix: string): string;
}

/** Асинхронная граница, которая загружает и инициализирует runtime без аргументов. */
export type RuntimeLoader = () => Promise<PixelRuntime>;

/** Каноническая пара дополнительного свойства: имя и строковое значение. */
export type ConversionProperty = [name: string, value: string];

/** Ожидаемая форма JSON, который TypeScript получает от WASM. */
export interface ConversionPayload {
  /** Версия conversion-контракта; текущая реализация использует `cv2`. */
  profile: string;
  /** Финальный 128-битный идентификатор события в lowercase hex. */
  clickId: string;
  /** Обратимое представление точного Unix timestamp в секундах. */
  pulse: string;
  /** Итоговые 64 hex-символа, передаваемые внутри event envelope. */
  score: string;
  /** Проверенные и канонически отсортированные пары свойств. */
  properties: ConversionProperty[];
}
