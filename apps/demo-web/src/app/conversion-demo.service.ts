/** API paths supported by the one-page demonstration. */
export type ApiJourney = '/api/auth/login' | '/api/auth/register';

/** Structural subset of the local telemetry package used by this service. */
export interface ConversionClient {
  /** Generates headers just before the request is sent. */
  getConversionHeaders(
    actionPath: string,
    properties?: Record<string, string>,
  ): Promise<Record<string, string>>;
}

/** User-safe result shown by the Angular component. */
export interface SubmissionResult {
  /** HTTP status returned by the demonstration endpoint. */
  status: number;
  /** Generic message that does not expose internal rejection details. */
  message: string;
}

/** Coordinates telemetry generation and the subsequent JSON request. */
export class ConversionDemoService {
  /** Stores the real facade and replaceable network boundary. */
  constructor(
    private readonly conversions: ConversionClient,
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  /** Sends one demonstration request without persisting credentials. */
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
