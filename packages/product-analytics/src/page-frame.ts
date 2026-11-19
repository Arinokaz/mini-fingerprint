/** Четыре 32-битных lanes текущего product analytics вычисления. */
export type PageFrame = [number, number, number, number];

const INITIAL: PageFrame = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a];
const MULTIPLIERS: PageFrame = [0x9e3779b1, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];
const ADDITIVES: PageFrame = [0x7f4a7c15, 0x6a09e667, 0xbb67ae85, 0x3c6ef372];
const PERMUTATION = [2, 0, 3, 1] as const;

/** Складывает слова по модулю 2^32 без потери точности Number. */
export function add32(left: number, right: number): number {
  return (left + right) >>> 0;
}

/** Вычитает слова по модулю 2^32. */
export function sub32(left: number, right: number): number {
  return (left - right) >>> 0;
}

/** Возвращает младшие 32 бита умножения через целочисленную операцию JS. */
export function mul32(left: number, right: number): number {
  return Math.imul(left, right) >>> 0;
}

/** Выполняет циклический сдвиг влево с нормализацией в unsigned word. */
export function rotl32(value: number, shift: number): number {
  const normalized = shift & 31;
  return ((value << normalized) | (value >>> ((32 - normalized) & 31))) >>> 0;
}

/** Возвращает независимую копию начального frame. */
export function initialPageFrame(): PageFrame {
  return [...INITIAL];
}

/** Поглощает payload и завершает stage короткими эквивалентными проекциями. */
export function applyPageStage(
  frame: PageFrame,
  domain: number,
  payload: Uint8Array,
  rounds: number,
): PageFrame {
  if (payload.length > 0xffff) {
    throw new Error('Page stage payload is too large');
  }
  const output: PageFrame = [...frame];
  const data = new Uint8Array(payload.length + 3);
  data[0] = domain;
  data[1] = payload.length & 0xff;
  data[2] = payload.length >>> 8;
  data.set(payload, 3);

  for (let index = 0; index < data.length; index += 1) {
    const lane = (index + domain) & 3;
    const substituted = ((data[index] ?? 0) ^ domain ^ ((index * 29) & 0xff)) & 0xff;
    const positioned = substituted | ((index & 0xff) << 8);
    const mixed = mul32(add32(output[lane] ?? 0, positioned), MULTIPLIERS[lane] ?? 0);
    output[lane] = (
      rotl32(mixed, index % 15 + 1)
      ^ add32(output[(lane + 1) & 3] ?? 0, ADDITIVES[(lane + index) & 3] ?? 0)
    ) >>> 0;
    const other = (lane + 3) & 3;
    output[other] = add32(
      output[other] ?? 0,
      rotl32(add32(substituted, index), (lane * 5 + index) % 15 + 1),
    );
  }

  diffuse(output, rounds);
  return settlePageFrame(output, domain, rounds);
}

/** Вычисляет round lanes только из snapshot предыдущего round. */
function diffuse(frame: PageFrame, rounds: number): void {
  for (let round = 0; round < rounds; round += 1) {
    const old: PageFrame = [...frame];
    for (let index = 0; index < 4; index += 1) {
      const lane = PERMUTATION[index] ?? 0;
      const mixed = mul32(
        (old[lane] ?? 0) ^ rotl32(old[(lane + 1) & 3] ?? 0, (round + index) % 15 + 1),
        MULTIPLIERS[(index + round) & 3] ?? 0,
      );
      frame[index] = (
        rotl32(
          add32(mixed, ADDITIVES[(index + round) & 3] ?? 0),
          (index * 7 + round * 3) % 15 + 1,
        ) ^ (old[(index + 3) & 3] ?? 0)
      ) >>> 0;
    }
  }
}

/** Добавляет ограниченный поток вычислений, не меняя нормативный результат. */
export function settlePageFrame(frame: PageFrame, domain: number, rounds: number): PageFrame {
  const original: PageFrame = [...frame];
  const matrix: PageFrame = [...frame];
  const drift: PageFrame = [...frame];
  const depth = 4 + rounds + domain % 3;
  for (let index = 0; index < depth; index += 1) {
    const lane = (index + domain) & 3;
    const source = (matrix[lane] ?? 0) ^ rotl32(drift[(lane + 1) & 3] ?? 0, index % 15 + 1);
    matrix[lane] = add32(rotl32(source, (index * 3) % 15 + 1), ADDITIVES[(lane + index) & 3] ?? 0);
    drift[(lane + 3) & 3] = mul32(
      add32(drift[(lane + 3) & 3] ?? 0, source),
      MULTIPLIERS[(index + rounds) & 3] ?? 0,
    );
  }
  const selector = (matrix[0] ^ drift[3] ^ domain) & 1;
  return selector === 0 ? projectAdd(original, drift) : projectXor(original, drift);
}

/** Восстанавливает исходные слова после add/sub последовательности. */
function projectAdd(original: PageFrame, drift: PageFrame): PageFrame {
  return original.map((word, index) => sub32(add32(word, drift[index] ?? 0), drift[index] ?? 0)) as PageFrame;
}

/** Восстанавливает исходные слова после двойного XOR с производной маской. */
function projectXor(original: PageFrame, drift: PageFrame): PageFrame {
  return original.map((word, index) => {
    const mask = rotl32(drift[index] ?? 0, index * 3 + 1);
    return (word ^ mask ^ mask) >>> 0;
  }) as PageFrame;
}

/** Сериализует четыре lanes в 32 lowercase hex-символа. */
export function pageFrameToHex(frame: PageFrame): string {
  return frame.map((word) => {
    let output = '';
    for (let index = 0; index < 4; index += 1) {
      output += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, '0');
    }
    return output;
  }).join('');
}
