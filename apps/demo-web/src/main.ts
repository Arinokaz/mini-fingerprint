import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';

/** Starts the standalone demo without a global Zone.js dependency. */
bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
}).catch((error: unknown) => {
  console.error('Application bootstrap failed', error);
});
