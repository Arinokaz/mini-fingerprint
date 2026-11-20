import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { marketingTelemetryInterceptor, TELEMETRY_SETTINGS } from '@company/marketing-telemetry';
import { productAnalyticsInterceptor, provideProductAnalytics } from '@company/product-analytics';
import { App } from './app/app';
import { environment } from './environments/environment';

/** Запускает standalone demo на стабильной Zone.js-модели Angular 16. */
bootstrapApplication(App, {
  providers: [
    {
      provide: TELEMETRY_SETTINGS,
      useValue: { measurementId: environment.telemetryMeasurementId },
    },
    provideProductAnalytics({ measurementId: environment.analyticsMeasurementId }),
    provideHttpClient(withInterceptors([
      productAnalyticsInterceptor,
      marketingTelemetryInterceptor,
    ])),
  ],
}).catch((error: unknown) => {
  // Ошибка старта относится к приложению целиком и не маскируется как HTTP-ответ.
  console.error('Application bootstrap failed', error);
});
