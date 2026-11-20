/** Отдельный staging marker, не смешиваемый с local/production конфигурацией. */
export const environment = {
  /** Значение, которое должна ожидать будущая staging PHP-проверка. */
  touchpoint: 'staging-build-tag',
  /** Публичный staging project ID marketing telemetry. */
  telemetryMeasurementId: 'G-STG-2026',
  /** Отдельный staging marker product analytics. */
  analyticsView: 'staging-view-2026.11',
  /** Публичный staging project ID product analytics. */
  analyticsMeasurementId: 'PA-STG-2026',
};
