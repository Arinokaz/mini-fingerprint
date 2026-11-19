import { EngagementState } from './engagement.js';
import { readCanvasCapabilities, readGraphics } from './graphics.js';
import { calculatePageResult } from './page-conversion.js';
import { createBrowserView, PageViewSequence } from './page-view.js';
import {
  ANALYTICS_PROFILE,
  DEVICE_HEADER,
  EVENT_HEADER,
  MEASUREMENT_HEADER,
  PROPERTIES_HEADER,
  SESSION_HEADER,
  UNRESOLVED_VIEW,
} from './settings.js';
import { createAnalyticsSnapshot, serializeSnapshot } from './snapshot.js';
import type { GraphicsState } from './types.js';

/** Лёгкая product analytics интеграция без дополнительных сетевых вызовов. */
export class ProductAnalytics {
  private readonly view: PageViewSequence;
  private readonly engagement = new EngagementState();
  private graphics: GraphicsState | undefined;
  private capabilities: { webgl: boolean; canvas2d: boolean } | undefined;

  constructor() {
    this.view = createBrowserView(Date.now(), globalThis.performance?.now() ?? 0);
  }

  /** Устанавливает engagement listeners до первого API-запроса. */
  start(): void {
    this.engagement.start();
  }

  /** Формирует независимый pa1 score и компактный analytics envelope. */
  async getEngagementHeaders(actionPath: string): Promise<Record<string, string>> {
    this.start();
    const nowMilliseconds = Date.now();
    const timestamp = Math.floor(nowMilliseconds / 1000);
    const eventId = this.view.nextEvent();
    const selection = currentView();
    if (this.graphics === undefined) {
      this.graphics = readGraphics(selection.canvas);
    }
    if (this.capabilities === undefined) {
      this.capabilities = readCanvasCapabilities(selection.canvas);
    }

    const result = calculatePageResult({
      actionPath,
      selectedView: selection.value,
      viewId: this.view.viewId,
      eventId,
      timestamp,
    });
    const snapshot = serializeSnapshot(createAnalyticsSnapshot({
      viewId: this.view.viewId,
      screenWidth: globalThis.screen?.width ?? Number.NaN,
      screenHeight: globalThis.screen?.height ?? Number.NaN,
      viewportWidth: globalThis.window?.innerWidth ?? Number.NaN,
      viewportHeight: globalThis.window?.innerHeight ?? Number.NaN,
      devicePixelRatio: globalThis.window?.devicePixelRatio ?? Number.NaN,
      hardwareConcurrency: globalThis.navigator?.hardwareConcurrency ?? Number.NaN,
      maxTouchPoints: globalThis.navigator?.maxTouchPoints ?? Number.NaN,
      language: globalThis.navigator?.language ?? 'unknown',
      timezone: currentTimezone(),
      graphics: this.graphics,
      features: currentFeatures(this.capabilities),
      engagement: this.engagement.snapshot(nowMilliseconds),
    }));

    return {
      [MEASUREMENT_HEADER]: ANALYTICS_PROFILE,
      [SESSION_HEADER]: result.pulse,
      [DEVICE_HEADER]: result.score,
      [EVENT_HEADER]: result.eventId,
      [PROPERTIES_HEADER]: encodeBase64Url(snapshot),
    };
  }
}

/** Выбирает marker только из одного полностью настроенного canvas. */
function currentView(): { value: string; canvas: HTMLCanvasElement | null } {
  const document = globalThis.document;
  if (document === undefined) {
    return { value: UNRESOLVED_VIEW, canvas: null };
  }
  const candidates = Array.from(document.querySelectorAll('canvas.analytics_stage')) as HTMLCanvasElement[];
  const canvas = candidates[0] ?? null;
  if (candidates.length !== 1) {
    return { value: UNRESOLVED_VIEW, canvas };
  }
  const value = candidates[0]?.dataset.view ?? '';
  const length = new TextEncoder().encode(value).length;
  if (length === 0 || length > 256) {
    return { value: UNRESOLVED_VIEW, canvas };
  }
  return { value, canvas };
}

/** Читает timezone без влияния локали на вычисления. */
function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Собирает восемь обычных analytics capability-битов. */
function currentFeatures(capabilities: { webgl: boolean; canvas2d: boolean }): number {
  const navigator = globalThis.navigator;
  let features = 0;
  if (typeof globalThis.WebAssembly !== 'undefined') features |= 1;
  if (capabilities.webgl) features |= 2;
  if (capabilities.canvas2d) features |= 4;
  if (storageAvailable()) features |= 8;
  if (navigator?.cookieEnabled === true) features |= 16;
  if (navigator?.pdfViewerEnabled === true) features |= 32;
  if (navigator?.userActivation !== undefined) features |= 64;
  if ((navigator?.maxTouchPoints ?? 0) > 0) features |= 128;
  return features;
}

/** Проверяет storage без сохранения каких-либо analytics-данных. */
function storageAvailable(): boolean {
  try {
    const storage = globalThis.window?.localStorage;
    if (storage === undefined) return false;
    const key = 'pa.capability';
    const previous = storage.getItem(key);
    try {
      storage.setItem(key, '1');
      return true;
    } finally {
      if (previous === null) storage.removeItem(key);
      else storage.setItem(key, previous);
    }
  } catch {
    return false;
  }
}

/** Кодирует UTF-8 snapshot в base64url без padding. */
function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
