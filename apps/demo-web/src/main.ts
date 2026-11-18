import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';

/** Запускает standalone demo без глобальной Zone.js-зависимости. */
bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
}).catch((error: unknown) => {
  // Ошибка старта относится к приложению целиком и не маскируется как HTTP-ответ.
  console.error('Application bootstrap failed', error);
});
