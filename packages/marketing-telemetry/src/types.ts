/** Минимальная поверхность generated WASM, необходимая TypeScript-фасаду. */
export interface PixelRuntime {
  /** Выполняет вычисление cv1 и возвращает результат в виде JSON-строки. */
  calculate_funnel_score(journey: string, propertiesJson: string): string;
}

/** Асинхронная граница, которая загружает и инициализирует runtime без аргументов. */
export type RuntimeLoader = () => Promise<PixelRuntime>;

/** Каноническая пара дополнительного свойства: имя и строковое значение. */
export type ConversionProperty = [name: string, value: string];

/** Ожидаемая форма JSON, который TypeScript получает от WASM. */
export interface ConversionPayload {
  /** Версия conversion-контракта; текущая реализация использует `cv1`. */
  profile: string;
  /** Обратимое представление точного Unix timestamp в секундах. */
  pulse: string;
  /** Итоговые 64 hex-символа, передаваемые в заголовке без изменений. */
  score: string;
  /** Проверенные и канонически отсортированные пары свойств. */
  properties: ConversionProperty[];
}
