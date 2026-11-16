import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TelemetrySdk } from '@company/marketing-telemetry';
import { environment } from '../environments/environment';
import { ApiJourney, ConversionDemoService } from './conversion-demo.service';

/** One-page component demonstrating login and registration header generation. */
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** Local build marker rendered into the hidden DOM touchpoint. */
  protected readonly touchpoint = environment.touchpoint;
  /** Generic request state visible to the user. */
  protected readonly status = signal('Выберите действие.');
  /** Prevents duplicate submissions while a request is in flight. */
  protected readonly busy = signal(false);

  /** Real local NPM facade configured with the public Wasm asset URL. */
  private readonly telemetry = new TelemetrySdk({ pixelUrl: environment.pixelUrl });
  /** Submission coordinator; no real account business logic is included. */
  private readonly demo = new ConversionDemoService(this.telemetry);

  /** Generates fresh headers and sends the selected demonstration request. */
  protected async submit(journey: ApiJourney, email: string, password: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.status.set('Отправка запроса…');
    try {
      const result = await this.demo.submit(journey, email, password);
      this.status.set(`${result.message} Статус: ${result.status}.`);
    } catch (error: unknown) {
      console.error('Conversion submission failed', error);
      this.status.set('Не удалось выполнить запрос.');
    } finally {
      this.busy.set(false);
    }
  }
}
