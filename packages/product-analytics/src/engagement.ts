import type { EngagementSnapshot } from './types.js';

/** Накапливает только bitmask и ограниченный счётчик вовлечения. */
export class EngagementState {
  private started = false;
  private inputCount = 0;
  private categoryMask = 0;
  private startedAt: number | undefined;
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  /** Устанавливает listeners один раз; повторный вызов ничего не сбрасывает. */
  start(target: Document | undefined = globalThis.document): void {
    if (this.started || target === undefined) {
      return;
    }
    this.started = true;
    this.startedAt = this.clock();
    this.listen(target, 'mousemove', 1, true);
    this.listen(target, 'keydown', 2, true);
    this.listen(target, 'touchstart', 4, true);
    this.listen(target, 'scroll', 8, true);
    this.listen(target, 'focus', 16, false);
    this.listen(target, 'blur', 16, false);
    this.listen(target, 'visibilitychange', 32, false);
  }

  /** Возвращает active/count/categories и возраст view на момент snapshot. */
  snapshot(nowMilliseconds: number): EngagementSnapshot {
    return [
      this.inputCount > 0 ? 1 : 0,
      this.inputCount === 0 ? 0 : this.inputCount === 1 ? 1 : this.inputCount <= 5 ? 2 : 3,
      this.categoryMask,
      ageBucket(this.startedAt === undefined ? 0 : Math.max(0, nowMilliseconds - this.startedAt)),
    ];
  }

  /** Регистрирует обработчик без чтения каких-либо полей события. */
  private listen(target: Document, type: string, bit: number, qualifying: boolean): void {
    target.addEventListener(type, () => {
      this.categoryMask |= bit;
      if (qualifying) {
        this.inputCount = Math.min(6, this.inputCount + 1);
      }
    }, { passive: true, capture: true });
  }
}

/** Переводит возраст view в пять документированных интервалов. */
function ageBucket(milliseconds: number): number {
  if (milliseconds < 1000) return 0;
  if (milliseconds < 5000) return 1;
  if (milliseconds < 15000) return 2;
  if (milliseconds < 60000) return 3;
  return 4;
}
