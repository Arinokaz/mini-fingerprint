import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { marketingTelemetryInterceptor } from '@company/marketing-telemetry';
import { App } from './app/app';

/** Запускает standalone demo без глобальной Zone.js-зависимости. */
bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([marketingTelemetryInterceptor])),
  ],
}).catch((error: unknown) => {
  // Ошибка старта относится к приложению целиком и не маскируется как HTTP-ответ.
  console.error('Application bootstrap failed', error);
});
