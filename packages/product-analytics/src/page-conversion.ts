import {
  bytesToHex,
  encodePageTime,
  hexIdToBytes,
  pageTimeToBytes,
  pageTimeToHex,
  timestampToBytes,
  validateActionPath,
  validateSelectedView,
  validateTimestamp,
} from './page-codec.js';
import {
  applyPageStage,
  initialPageFrame,
  pageFrameToHex,
} from './page-frame.js';
import type { PageFrame } from './page-frame.js';

/** Все нормативные входы одного pa1 вычисления. */
export interface PageContext {
  actionPath: string;
  selectedView: string;
  viewId: string;
  eventId: string;
  timestamp: number;
}

/** Публичный результат независимого analytics conversion. */
export interface PageResult {
  profile: 'pa1';
  pulse: string;
  score: string;
  eventId: string;
}

/** Промежуточные состояния, необходимые независимым fixtures. */
export interface PageTrace {
  frames: {
    page: PageFrame;
    view: PageFrame;
    event: PageFrame;
    time: PageFrame;
  };
  result: PageResult;
}

/** Выполняет четыре стадии pa1 и возвращает только итоговый результат. */
export function calculatePageResult(context: PageContext): PageResult {
  return tracePageResult(context).result;
}

/** Сохраняет промежуточные frames для проверки побитовой эквивалентности. */
export function tracePageResult(context: PageContext): PageTrace {
  validateActionPath(context.actionPath);
  validateSelectedView(context.selectedView);
  validateTimestamp(context.timestamp);
  const viewBytes = hexIdToBytes(context.viewId);
  const eventBytes = hexIdToBytes(context.eventId);
  const encoder = new TextEncoder();

  const page = applyPageStage(initialPageFrame(), 0x35, encoder.encode(context.actionPath), 2);
  const view = applyPageStage(page, 0x8e, encoder.encode(context.selectedView), 3);
  const eventPayload = new Uint8Array(32);
  eventPayload.set(viewBytes, 0);
  eventPayload.set(eventBytes, 16);
  const event = applyPageStage(view, 0x59, eventPayload, 2);

  const encoded = encodePageTime(context.timestamp);
  const timePayload = new Uint8Array(16);
  timePayload.set(pageTimeToBytes(encoded), 0);
  timePayload.set(timestampToBytes(context.timestamp), 8);
  const time = applyPageStage(event, 0xd4, timePayload, 3);

  return {
    frames: { page, view, event, time },
    result: {
      profile: 'pa1',
      pulse: pageTimeToHex(encoded),
      score: pageFrameToHex(time),
      eventId: bytesToHex(eventBytes),
    },
  };
}
