import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** Два API-пути, поддерживаемые демонстрационной страницей. */
export type ApiJourney = '/api/auth/login' | '/api/auth/register';

/** Безопасный для шаблона результат без тела и внутренних деталей ответа. */
export interface SubmissionResult {
  /** HTTP status, полученный от demo endpoint. */
  status: number;
  /** Generic сообщение, одинаково не раскрывающее причину отклонения. */
  message: string;
}

/** Отправляет JSON; telemetry-заголовки добавляет зарегистрированный interceptor. */
export class ConversionDemoService {
  constructor(private readonly http: HttpClient) {}

  /** Отправляет login/register POST и скрывает детали HTTP-отклонения. */
  async submit(journey: ApiJourney, email: string, password: string): Promise<SubmissionResult> {
    try {
      const response = await firstValueFrom(this.http.post(
        journey,
        { email, password },
        { observe: 'response' },
      ));
      return { status: response.status, message: 'Сервер принял запрос.' };
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status > 0) {
        return { status: error.status, message: 'Сервер отклонил запрос.' };
      }
      throw error;
    }
  }
}
