import {
  ENVIRONMENT_INITIALIZER,
  inject,
  InjectionToken,
  Provider,
} from '@angular/core';
import { ProductAnalytics } from './product-analytics.js';
import type { ProductAnalyticsSettings } from './types.js';

/** Один analytics facade на root injector приложения. */
export const PRODUCT_ANALYTICS = new InjectionToken<ProductAnalytics>('PRODUCT_ANALYTICS', {
  providedIn: 'root',
  factory: () => new ProductAnalytics(),
});

/** Регистрирует ранний сбор engagement до первого запроса HttpClient. */
export function provideProductAnalytics(settings: ProductAnalyticsSettings = {}): Provider[] {
  return [
    {
      provide: PRODUCT_ANALYTICS,
      useFactory: () => new ProductAnalytics(settings),
    },
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        inject(PRODUCT_ANALYTICS).start();
      },
    },
  ];
}
