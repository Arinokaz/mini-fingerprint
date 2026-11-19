import { bytesToHex, writeU32 } from './page-codec.js';

/** Хранит стабильный viewId и последовательность событий внутри view. */
export class PageViewSequence {
  readonly viewId: string;
  private current: [number, number, number, number];

  constructor(initialWords: [number, number, number, number]) {
    this.current = [...initialWords];
    this.viewId = wordsToHex(this.current);
  }

  /** Возвращает следующий eventId с переносом между четырьмя словами. */
  nextEvent(): string {
    for (let index = 0; index < 4; index += 1) {
      this.current[index] = ((this.current[index] ?? 0) + 1) >>> 0;
      if (this.current[index] !== 0) break;
    }
    return wordsToHex(this.current);
  }
}

/** Формирует начальный view из обычных analytics-источников браузера. */
export function createBrowserView(
  nowMilliseconds: number,
  performanceMilliseconds: number,
  random: () => number = Math.random,
): PageViewSequence {
  const now = Math.floor(nowMilliseconds);
  const performanceMicros = Math.floor(performanceMilliseconds * 1000);
  const randomWord = () => Math.floor(random() * 0x100000000) >>> 0;
  return new PageViewSequence([
    (randomWord() ^ now) >>> 0,
    (randomWord() ^ Math.floor(now / 0x100000000)) >>> 0,
    (randomWord() ^ performanceMicros) >>> 0,
    randomWord(),
  ]);
}

/** Сериализует слова от младшего к старшему в lowercase hex. */
function wordsToHex(words: [number, number, number, number]): string {
  const bytes = new Uint8Array(16);
  words.forEach((word, index) => writeU32(bytes, index * 4, word));
  return bytesToHex(bytes);
}
