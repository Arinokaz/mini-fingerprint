import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { catchError, from, of, switchMap } from 'rxjs';
import { TelemetrySdk } from './conversion.js';

/** Один browser runtime на root injector приложения. */
export const TELEMETRY_SDK = new InjectionToken<TelemetrySdk>('MARKETING_TELEMETRY_SDK', {
  providedIn: 'root',
  factory: () => new TelemetrySdk(),
});

/** Извлекает путь, совпадающий с серверным journey без query и fragment. */
function requestPath(request: HttpRequest<unknown>, baseURI: string): string {
  return new URL(request.url, baseURI).pathname;
}

/** Добавляет свежие telemetry-заголовки к каждому Angular HttpClient-запросу. */
export const marketingTelemetryInterceptor: HttpInterceptorFn = (request, next) => {
  const telemetry = inject(TELEMETRY_SDK);
  const document = inject(DOCUMENT);
  return from(Promise.resolve().then(async () => {
    const headers = await telemetry.getConversionHeaders(requestPath(request, document.baseURI), {});
    return request.clone({ setHeaders: headers });
  })).pipe(
    catchError(() => of(request)),
    switchMap((outgoingRequest) => next(outgoingRequest)),
  );
};
