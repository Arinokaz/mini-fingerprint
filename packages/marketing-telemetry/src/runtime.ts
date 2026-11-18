import type { PixelRuntime, RuntimeLoader } from './types.js';

/**
 * Загружает вычислительный модуль только при первом обращении к runtime.
 *
 * Этот dynamic import является общей точкой двух вариантов сборки: embedded
 * встраивает модуль в основной JS, а lazy выносит его в отдельный JS chunk.
 */
export const loadPixelRuntime: RuntimeLoader = async () => {
  const pixel = await import('./pixel-runtime.js');
  return pixel.instantiatePixelRuntime();
};

/** Координирует lazy-инициализацию в пределах одного экземпляра TelemetrySdk. */
export class RuntimeGate {
  /**
   * Общий Promise текущей или завершённой инициализации.
   * После rejection поле очищается, чтобы следующая попытка могла повторить загрузку.
   */
  private pending?: Promise<PixelRuntime>;

  /** Сохраняет внешнюю границу загрузки; подмена loader используется в тестах. */
  constructor(private readonly loader: RuntimeLoader = loadPixelRuntime) {}

  /**
   * Возвращает runtime, не создавая параллельных инициализаций.
   *
   * Все одновременные вызовы получают один и тот же Promise. Ошибка не
   * блокирует повтор навсегда: следующий вызов запускает новую попытку.
   */
  acquire(): Promise<PixelRuntime> {
    if (this.pending === undefined) {
      const attempt = this.loader().catch((error: unknown) => {
        // Старый rejection не должен очистить Promise более новой попытки.
        if (this.pending === attempt) {
          this.pending = undefined;
        }
        throw error;
      });
      this.pending = attempt;
    }
    return this.pending;
  }
}
