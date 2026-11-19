import { hexIdToBytes } from './page-codec.js';
import type { AnalyticsSnapshot, EngagementSnapshot, SnapshotInput } from './types.js';

const encoder = new TextEncoder();

/** Нормализует environment values в компактный envelope фиксированной формы. */
export function createAnalyticsSnapshot(input: SnapshotInput): AnalyticsSnapshot {
  hexIdToBytes(input.viewId);
  return {
    v: 1,
    viewId: input.viewId,
    screen: dimensions(input.screenWidth, input.screenHeight),
    viewport: dimensions(input.viewportWidth, input.viewportHeight),
    dpr: dprPercent(input.devicePixelRatio),
    cores: coreBucket(input.hardwareConcurrency),
    touch: cappedInteger(input.maxTouchPoints, 0, 5),
    lang: truncateText(input.language.trim() || 'unknown', 32),
    tz: truncateText(input.timezone.trim() || 'unknown', 64),
    gfx: input.graphics,
    features: input.features & 0xff,
    engagement: engagement(input.engagement),
  };
}

/** JSON.stringify сохраняет порядок создания полей и не добавляет whitespace. */
export function serializeSnapshot(snapshot: AnalyticsSnapshot): string {
  const output = JSON.stringify(snapshot);
  const bytes = encoder.encode(output);
  if (bytes.length > 1024) {
    throw new Error('Analytics snapshot exceeds 1024 bytes');
  }
  return output;
}

/** Сохраняет только целочисленные ограниченные размеры. */
function dimensions(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'unavailable';
  }
  return `${cappedInteger(width, 1, 16384)}x${cappedInteger(height, 1, 16384)}`;
}

/** Представляет DPR процентами с шагом 25. */
function dprPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return cappedInteger(Math.round(value * 100 / 25) * 25, 25, 400);
}

/** Сохраняет только небольшой bucket ядер. */
function coreBucket(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value <= 2) return 2;
  if (value <= 4) return 4;
  if (value <= 8) return 8;
  return 16;
}

/** Ограничивает и округляет число до диапазона. */
function cappedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

/** Обрезает текст по UTF-8 байтам на границе code point. */
function truncateText(value: string, maximumBytes: number): string {
  let output = '';
  let length = 0;
  for (const character of value) {
    const nextLength = encoder.encode(character).length;
    if (length + nextLength > maximumBytes) break;
    output += character;
    length += nextLength;
  }
  return output;
}

/** Проверяет форму четырёх engagement values без сохранения событий. */
function engagement(value: EngagementSnapshot): EngagementSnapshot {
  return [
    cappedInteger(value[0], 0, 1),
    cappedInteger(value[1], 0, 3),
    cappedInteger(value[2], 0, 63) & 0x3f,
    cappedInteger(value[3], 0, 4),
  ];
}
