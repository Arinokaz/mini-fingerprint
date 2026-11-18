# Дизайн русских исходных комментариев

## Назначение

Дополнить отдельные PHP-oriented module guides полными русскоязычными комментариями непосредственно в исходниках, чтобы назначение классов, методов и сложных вычислений было видно при чтении кода.

## Цели и границы

- Охватить handwritten `packages/marketing-telemetry/src/*.ts`, `packages/marketing-telemetry/scripts/*.mjs`, `crates/funnel-wasm/src/*.rs`, `apps/demo-web/src/**/*.ts` и корневой `scripts/build-wasm.mjs`.
- Перевести существующие English comments и дополнить важные классы, публичные/внутренние методы, параметры, результат, side effects, ошибки и инварианты.
- Не комментировать очевидные строки, не копировать код прозой и не менять поведение.
- Не редактировать generated `pkg/**`, `dist/**`, `generated-pixel.ts`, Angular output или release artifacts вручную.
- Не добавлять секреты и не ослаблять существующую маскировку в распространяемом JS.
- Не выполнять commit/push: пользователь управляет Git самостоятельно.

## Подходы

1. **Русские source comments + отдельные docs — выбрано.** Быстрый контекст в редакторе и подробная внешняя документация дополняют друг друга.
2. **Только внешние docs — отклонено пользователем.** Не даёт контекста непосредственно в коде.
3. **Ручное удаление comments перед release — отклонено.** Существующие TypeScript `removeComments`, esbuild minify/legalComments none и release artifact tests удаляют их автоматически; Rust comments не попадают в WASM.

## Проверка

- TypeScript/Angular compile и package tests.
- Native Rust tests.
- `build:npm`, release archive checks: comments/source maps отсутствуют, base64 не дублируется.
- `git diff --check`; diff содержит только comments и внутренние plan/spec docs.
- Отдельное read-only review полноты/точности русских комментариев. Локальные изменения остаются без commit.
