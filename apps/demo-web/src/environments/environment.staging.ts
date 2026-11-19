/** Отдельный staging marker, не смешиваемый с local/production конфигурацией. */
export const environment = {
  /** Значение, которое должна ожидать будущая staging PHP-проверка. */
  touchpoint: 'staging-build-tag',
  /** Отдельный staging marker product analytics. */
  analyticsView: 'staging-view-2026.11',
};
