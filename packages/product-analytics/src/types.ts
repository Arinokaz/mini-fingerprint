/** Допустимая обобщённая graphics-категория analytics snapshot. */
export type GraphicsState = 0 | 1 | 2 | 3;

/** Четыре огрублённых значения вовлечения на текущий view. */
export type EngagementSnapshot = [number, number, number, number];

/** Нормализованный analytics envelope, не участвующий в pa1 score. */
export interface AnalyticsSnapshot {
  v: 1;
  viewId: string;
  screen: string;
  viewport: string;
  dpr: number;
  cores: number;
  touch: number;
  lang: string;
  tz: string;
  gfx: GraphicsState;
  features: number;
  engagement: EngagementSnapshot;
}

/** Входные значения до ограничения и нормализации. */
export interface SnapshotInput {
  viewId: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  maxTouchPoints: number;
  language: string;
  timezone: string;
  graphics: GraphicsState;
  features: number;
  engagement: EngagementSnapshot;
}
