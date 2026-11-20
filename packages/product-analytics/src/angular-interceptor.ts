import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, of, switchMap } from 'rxjs';
import {
  DEVICE_HEADER,
  EVENT_HEADER,
  MEASUREMENT_HEADER,
  PROPERTIES_HEADER,
  SESSION_HEADER,
} from './settings.js';
import { PRODUCT_ANALYTICS } from './providers.js';

const HEADER_NAMES = [
  MEASUREMENT_HEADER,
  SESSION_HEADER,
  DEVICE_HEADER,
  EVENT_HEADER,
  PROPERTIES_HEADER,
] as const;

/** Удаляет current и legacy pa1 headers после ошибки генерации. */
function withoutAnalyticsHeaders(request: HttpRequest<unknown>): HttpRequest<unknown> {
  if (!HEADER_NAMES.some((name) => request.headers.has(name))) {
    return request;
  }
  let headers = request.headers;
  for (const name of HEADER_NAMES) {
    headers = headers.delete(name);
  }
  return request.clone({ headers });
}

/** Добавляет свежий analytics envelope к каждому HttpClient-запросу. */
export const productAnalyticsInterceptor: HttpInterceptorFn = (request, next) => {
  const analytics = inject(PRODUCT_ANALYTICS);
  const document = inject(DOCUMENT);
  return from(Promise.resolve().then(async () => {
    const pathname = new URL(request.url, document.baseURI).pathname;
    return withoutAnalyticsHeaders(request).clone({
      setHeaders: await analytics.getEngagementHeaders(pathname),
    });
  })).pipe(
    catchError(() => of(withoutAnalyticsHeaders(request))),
    switchMap((outgoingRequest) => next(outgoingRequest)),
  );
};
