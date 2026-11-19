import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { catchError, from, of, switchMap } from 'rxjs';
import { TelemetrySdk } from './conversion.js';
import {
  COUNTER_HEADER,
  DEVICE_HEADER,
  MEASUREMENT_HEADER,
  PROPERTIES_HEADER,
  SESSION_HEADER,
} from './settings.js';

const TELEMETRY_HEADER_NAMES = [
  MEASUREMENT_HEADER,
  SESSION_HEADER,
  DEVICE_HEADER,
  PROPERTIES_HEADER,
  COUNTER_HEADER,
] as const;

/** Один browser runtime на root injector приложения. */
export const TELEMETRY_SDK = new InjectionToken<TelemetrySdk>('MARKETING_TELEMETRY_SDK', {
  providedIn: 'root',
  factory: () => new TelemetrySdk(),
});

/** Извлекает путь, совпадающий с серверным journey без query и fragment. */
function requestPath(request: HttpRequest<unknown>, baseURI: string): string {
  return new URL(request.url, baseURI).pathname;
}

/** Удаляет только принадлежащие пакету заголовки после ошибки генерации. */
function withoutTelemetryHeaders(request: HttpRequest<unknown>): HttpRequest<unknown> {
  if (!TELEMETRY_HEADER_NAMES.some((name) => request.headers.has(name))) {
    return request;
  }
  let headers = request.headers;
  for (const name of TELEMETRY_HEADER_NAMES) {
    headers = headers.delete(name);
  }
  return request.clone({ headers });
}

/** Добавляет свежие telemetry-заголовки к каждому Angular HttpClient-запросу. */
export const marketingTelemetryInterceptor: HttpInterceptorFn = (request, next) => {
  const telemetry = inject(TELEMETRY_SDK);
  const document = inject(DOCUMENT);
  return from(Promise.resolve().then(async () => {
    const headers = await telemetry.getConversionHeaders(requestPath(request, document.baseURI), {});
    return request.clone({ setHeaders: headers });
  })).pipe(
    catchError(() => of(withoutTelemetryHeaders(request))),
    switchMap((outgoingRequest) => next(outgoingRequest)),
  );
};
