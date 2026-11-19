import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { ApiJourney, ConversionDemoService } from './conversion-demo.service';

/**
 * Корневой компонент одностраничного login/register demo.
 * Управляет состоянием формы, а вычисления и отправку делегирует сервисам.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** DOM marker текущей сборки, передаваемый в шаблон через data-tag. */
  protected readonly touchpoint = environment.touchpoint;
  /** Marker независимого product analytics view. */
  protected readonly analyticsView = environment.analyticsView;
  /** Краткое состояние операции без внутренних технических подробностей. */
  protected readonly status = signal('Выберите действие.');
  /** Запрещает повторный submit, пока предыдущая операция не завершилась. */
  protected readonly busy = signal(false);

  /** Координатор HTTP-запроса; interceptor добавляет telemetry независимо от формы. */
  private readonly demo = new ConversionDemoService(inject(HttpClient));

  /**
   * Получает свежие заголовки и отправляет выбранный login/register запрос.
   * Исключение остаётся в console для разработчика, а шаблон получает generic status.
   */
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
      // Busy снимается и при успехе, и при HTTP rejection, и при исключении.
      this.busy.set(false);
    }
  }
}
