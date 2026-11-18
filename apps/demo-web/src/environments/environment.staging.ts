/** Отдельный staging marker, не смешиваемый с local/production конфигурацией. */
export const environment = {
  /** Значение, которое должна ожидать будущая staging PHP-проверка. */
  touchpoint: 'staging-build-tag',
};
