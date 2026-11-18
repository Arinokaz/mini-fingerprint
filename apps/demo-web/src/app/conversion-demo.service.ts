/** Два API-пути, поддерживаемые демонстрационной страницей. */
export type ApiJourney = '/api/auth/login' | '/api/auth/register';

/** Минимальный telemetry-контракт, необходимый сервису отправки. */
export interface ConversionClient {
  /** Получает заголовки непосредственно перед соответствующим запросом. */
  getConversionHeaders(
    actionPath: string,
    properties?: Record<string, string>,
  ): Promise<Record<string, string>>;
}

/** Безопасный для шаблона результат без тела и внутренних деталей ответа. */
export interface SubmissionResult {
  /** HTTP status, полученный от demo endpoint. */
  status: number;
  /** Generic сообщение, одинаково не раскрывающее причину отклонения. */
  message: string;
}

/**
 * Координирует вычисление telemetry и отправку JSON.
 * Не хранит credentials и не реализует серверную проверку.
 */
export class ConversionDemoService {
  /**
   * Принимает минимальный client и сетевую границу.
   * Default wrapper сохраняет globalThis как receiver браузерного fetch.
   */
  constructor(
    private readonly conversions: ConversionClient,
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  /** Формирует свежие заголовки и сразу отправляет login/register POST. */
  async submit(journey: ApiJourney, email: string, password: string): Promise<SubmissionResult> {
    const actionName = journey.endsWith('/register') ? 'register' : 'login';
    const conversionHeaders = await this.conversions.getConversionHeaders(journey, {
      form: actionName,
    });
    const response = await this.fetcher(journey, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        ...conversionHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    return {
      status: response.status,
      message: response.ok ? 'Сервер принял запрос.' : 'Сервер отклонил запрос.',
    };
  }
}
