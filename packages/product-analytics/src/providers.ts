import {
  ENVIRONMENT_INITIALIZER,
  inject,
  InjectionToken,
  Provider,
} from '@angular/core';
import { ProductAnalytics } from './product-analytics.js';

/** Один analytics facade на root injector приложения. */
export const PRODUCT_ANALYTICS = new InjectionToken<ProductAnalytics>('PRODUCT_ANALYTICS', {
  providedIn: 'root',
  factory: () => new ProductAnalytics(),
});

/** Регистрирует ранний сбор engagement до первого запроса HttpClient. */
export function provideProductAnalytics(): Provider[] {
  return [
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        inject(PRODUCT_ANALYTICS).start();
      },
    },
  ];
}
