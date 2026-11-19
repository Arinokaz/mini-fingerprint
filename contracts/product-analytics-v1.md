# Контракт `product-analytics-v1` (`pa1`)

## 1. Назначение

`pa1` определяет независимое лёгкое вычисление TypeScript product analytics из API pathname, DOM view marker, viewId, eventId и Unix timestamp. Результат не является криптографической подписью или доказательством присутствия человека.

`pa1` не повторяет `cv1`/`cv2`. Screen/device/locale/runtime/graphics/engagement snapshot не участвует в score; связь snapshot с результатом обеспечивается общим eventId в одном наборе HTTP-заголовков.

Эталонные значения: `tests/fixtures/product-analytics-v1.json`.

## 2. Базовые операции

Frame состоит из четырёх `u32`. Все операции сохраняют младшие 32 бита:

- `add32(a,b) = (a+b) mod 2^32`;
- `sub32(a,b) = (a-b) mod 2^32`;
- `mul32` возвращает младшие 32 бита произведения;
- `rotl32(a,n)` — циклический сдвиг влево на `n mod 32`;
- `u16le`, `u32le`, `u64le` — little-endian представления.

TypeScript использует `Math.imul(a,b) >>> 0`, unsigned shifts и `>>>0`. Будущий PHP использует 16-битные части для умножения без float.

## 3. Константы

```text
INITIAL     = [6a09e667, bb67ae85, 3c6ef372, a54ff53a]
MULTIPLIERS = [9e3779b1, 85ebca6b, c2b2ae35, 27d4eb2f]
ADDITIVES   = [7f4a7c15, 6a09e667, bb67ae85, 3c6ef372]
PERMUTATION = [2, 0, 3, 1]
```

| Stage | Domain | Rounds |
|---|---:|---:|
| page | `0x35` | 2 |
| view | `0x8e` | 3 |
| event | `0x59` | 2 |
| time | `0xd4` | 3 |

## 4. Входы

- `actionPath`: абсолютный pathname 1–512 UTF-8 bytes без query, fragment и NUL.
- `selectedView`: настроенный DOM marker 1–256 UTF-8 bytes либо `analytics.unresolved.v1`.
- `viewId`, `eventId`: ровно 16 bytes, внешне 32 lowercase hex.
- `timestamp`: неотрицательный Unix timestamp в секундах, точно представимый TypeScript safe integer.

## 5. Поглощение и diffuse

`absorb(frame, domain, payload, rounds)` формирует:

```text
data = domain || u16le(payloadLength) || payload
```

Для byte `b` с нулевым index `i`:

```text
lane = (i + domain) mod 4
s = b XOR domain XOR ((i × 29) mod 256)
m = mul32(add32(frame[lane], s OR ((i mod 256) << 8)), MULTIPLIERS[lane])
frame[lane] = rotl32(m, (i mod 15)+1) XOR
              add32(frame[(lane+1) mod 4], ADDITIVES[(lane+i) mod 4])
other = (lane+3) mod 4
frame[other] = add32(frame[other],
  rotl32(add32(s, i), ((lane×5+i) mod 15)+1))
```

Изменения видны следующим итерациям. Затем выполняется `diffuse`.

Для каждого round сохраняется snapshot `old`. Для `i=0..3`:

```text
j = PERMUTATION[i]
mixed = mul32(old[j] XOR rotl32(old[(j+1) mod 4], ((round+i) mod 15)+1),
              MULTIPLIERS[(i+round) mod 4])
frame[i] = rotl32(add32(mixed, ADDITIVES[(i+round) mod 4]),
                  ((i×7+round×3) mod 15)+1) XOR old[(i+3) mod 4]
```

После stage разрешены дополнительные bounded projections, которые восстанавливают нормативный frame. Они не входят в результат и проверяются тестами эквивалентности.

## 6. Время

```text
K0=51f15eed, K1=9e3779b9, K2=6d2b79f5, C=7f4a7c15
a = low32(timestamp) XOR K0
b = high32(timestamp) XOR K1
x = add32(a, rotl32(b, 11))
y = b XOR rotl32(x, 7)
out0 = x XOR K2
out1 = add32(y, C)
pulse = hex(u32le(out0) || u32le(out1))
```

Декодирование:

```text
x = out0 XOR K2
y = sub32(out1, C)
b = y XOR rotl32(x, 7)
a = sub32(x, rotl32(b, 11))
timestamp = (a XOR K0) OR ((b XOR K1) << 32)
```

## 7. Последовательность

```text
frame = INITIAL
frame = absorb(frame, 0x35, utf8(actionPath), 2)
frame = absorb(frame, 0x8e, utf8(selectedView), 3)
eventPayload = viewIdBytes || eventIdBytes
frame = absorb(frame, 0x59, eventPayload, 2)
timePayload = u32le(out0) || u32le(out1) || u64le(timestamp)
frame = absorb(frame, 0xd4, timePayload, 3)
score = hex(u32le(frame[0]) || ... || u32le(frame[3]))
```

Score содержит ровно 32 lowercase hex; pulse — 16 lowercase hex.

## 8. DOM marker

TypeScript ищет `canvas.analytics_stage`. Marker принимается только при ровно одном элементе, непустом `data-view` и длине не более 256 UTF-8 bytes. Missing/empty/duplicate/oversized дают `analytics.unresolved.v1`.

Будущий backend использует собственный ожидаемый marker и не принимает fallback как configured production marker.

## 9. HTTP-заголовки

| Заголовок | Значение |
|---|---|
| `X-PA-Measurement-Id` | `pa1` |
| `X-PA-Session-Id` | pulse, 16 hex |
| `X-PA-Device-Id` | score, 32 hex |
| `X-PA-Event-Id` | eventId, 32 hex |
| `X-PA-Session-Properties` | compact analytics JSON в base64url без padding |

Snapshot имеет поля `v`, `viewId`, `screen`, `viewport`, `dpr`, `cores`, `touch`, `lang`, `tz`, `gfx`, `features`, `engagement` в указанном порядке. Raw JSON не превышает 1024 bytes, base64url — 1400 chars.

`gfx`: 0 unknown, 1 standard, 2 software, 3 unavailable. `engagement`: `[active,countBucket,categoryMask,ageBucket]`. Детальная семантика определяется design и зеркальными fixtures; ни одно значение не меняет score.

## 10. Будущая серверная проверка

Backend должен проверить форматы/размеры, восстановить timestamp и TTL, использовать фактический route и ожидаемый server view marker, повторить четыре stage и сравнить score через `hash_equals()`.

Analytics envelope передаётся в отдельный внутренний процессор асинхронно. Он не нужен для синхронного вычисления score. Отсутствие single-use хранилища допускает replay в пределах TTL; это ограничение должно быть учтено при backend rollout.
