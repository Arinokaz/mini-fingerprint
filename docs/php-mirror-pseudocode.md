# PHP 8.4 mirror — псевдокод для будущей реализации

PHP-реализация временно отложена. Этот документ не является готовым кодом и не подключается к проекту. Активный frontend использует `cv2`: общие операции наследуются от `contracts/conversion-v1.md`, а clickId/scorePrefix определены в `contracts/conversion-v2.md`. Ожидаемые значения находятся в fixtures обеих версий.

## 1. Предлагаемые компоненты

```text
UInt32                 Только 32-битная арифметика без float и GMP.
PropertyCodec          Проверка, сортировка и канонизация свойств.
PulseCodec             Обратимое кодирование/декодирование времени.
ClickCodec             Строгие 32 hex ↔ 16 байт clickId и prefix check.
EventEnvelope          Strict base64url/JSON и canonical fields cv2/pa1.
JourneyContext         Проверенные входные данные одного вычисления.
FunnelStageInterface   Общий интерфейс четырёх рабочих стадий.
FrameReducer           Порядок стадий и сериализация кадра.
ConversionCheckpoint   Проверка заголовков, TTL и итогового значения.
```

## 2. UInt32

```pseudo
MASK = 0xffffffff

function add32(a, b):
    // Сумма двух u32 не превышает 2^33 и безопасна для PHP int.
    return (a + b) bitwiseAND MASK

function sub32(a, b):
    // На 64-битном PHP отрицательный int имеет двоичное дополнение.
    return (a - b) bitwiseAND MASK

function mul32(a, b):
    // Прямое a*b запрещено: возможен переход к float.
    aLow  = a bitwiseAND 0xffff
    aHigh = (a rightShift 16) bitwiseAND 0xffff
    bLow  = b bitwiseAND 0xffff
    bHigh = (b rightShift 16) bitwiseAND 0xffff

    lowProduct = aLow * bLow
    carry = lowProduct rightShift 16
    middle = aHigh*bLow + aLow*bHigh + carry

    resultLow = lowProduct bitwiseAND 0xffff
    resultHigh = middle bitwiseAND 0xffff
    return ((resultHigh leftShift 16) bitwiseOR resultLow) bitwiseAND MASK

function rotateLeft32(value, shift):
    shift = shift modulo 32
    if shift == 0:
        return value bitwiseAND MASK
    left = (value leftShift shift) bitwiseAND MASK
    right = value rightShift (32 - shift)
    return (left bitwiseOR right) bitwiseAND MASK
```

Обязательные тесты: все `arithmetic` из fixtures, отдельно `0xffffffff × 0xffffffff = 1`, сдвиги 0/1/31/32 и отсутствие `float` после каждой операции.

## 3. PropertyCodec

```pseudo
function parse(jsonText):
    if byteLength(jsonText) > 4096: reject
    pairs = json_decode(jsonText, associative=true)
    if pairs is not list or count(pairs) > 32: reject

    seenNames = empty set
    output = empty list
    for pair in pairs:
        require pair is list of exactly two strings
        name = pair[0]
        value = pair[1]
        require name matches /^[a-z0-9_.-]{1,64}$/
        require name not in RESERVED_NAMES
        require byteLength(value) <= 512
        require name not in seenNames
        add name to seenNames
        append [name, value] to output

    sort output by raw ASCII name bytes
    return output

function canonicalJson(sortedPairs):
    // JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES |
    // JSON_UNESCAPED_LINE_TERMINATORS; без пробелов.
    // Результат должен совпадать с Rust canonical_json().
    return deterministicJson(sortedPairs)

function canonicalBytes(sortedPairs):
    bytes = empty byte string
    for [name, value] in sortedPairs:
        bytes += littleEndian32(byteLength(name)) + name
        bytes += littleEndian32(byteLength(value)) + value
    return bytes
```

Перед вычислением PHP должен сравнить полученный JSON с его канонической формой. Дубликаты не терять при `json_decode`: транспорт использует массив пар, а не объект.

## 4. PulseCodec

```pseudo
K0 = 0xa53c9e17; K1 = 0x6d2b79f5
C0 = 0x9e3779b9; C1 = 0x7f4a7c15

function encode(timestamp):
    a = low32(timestamp) XOR K0
    b = high32(timestamp) XOR K1
    c = add32(a, rotateLeft32(b, 7))
    d = b
    e = c
    f = add32(d, rotateLeft32(c, 13))
    return [e XOR C0, f XOR C1]

function decode(parts):
    e = parts[0] XOR C0
    f = parts[1] XOR C1
    d = sub32(f, rotateLeft32(e, 13))
    c = e
    a = sub32(c, rotateLeft32(d, 7))
    b = d
    low = a XOR K0
    high = b XOR K1
    return low OR (high leftShift 32)

function acceptedTimestamp(timestamp, serverTime, maxPastSeconds = 30, maxFutureSeconds = 5):
    return timestamp >= serverTime - maxPastSeconds
        AND timestamp <= serverTime + maxFutureSeconds

function parseAndCheck(pulseHex, serverTime):
    require pulseHex matches /^[0-9a-f]{16}$/
    parts = readTwoLittleEndianU32(pulseHex)
    timestamp = decode(parts)
    require encode(timestamp) == parts
    require acceptedTimestamp(timestamp, serverTime)
    return [timestamp, parts]
```

## 5. Стадии и FrameReducer

```pseudo
interface FunnelStageInterface:
    function apply(frame[8], JourneyContext context) -> frame[8]

JourneyStage:
    return absorb(frame, 0x4a, utf8(context.journey), rounds=4)

TouchpointStage:
    return absorb(frame, 0xb7, utf8(context.expectedServerTag), rounds=4)

PropertiesStage:
    payload = PropertyCodec.canonicalBytes(context.properties)
    return absorb(frame, 0xd9, payload, rounds=4)

ClickStage:
    // Только cv2: ровно 16 байт из полученного clickId.
    return absorb(frame, 0xc1, context.clickIdBytes, rounds=4)

PulseStage:
    payload = littleEndian32(out0) + littleEndian32(out1) + littleEndian64(timestamp)
    return absorb(frame, 0xe3, payload, rounds=8)
```

На PHP не требуется повторять декоративные ветвления Wasm: они не меняют результат. PHP повторяет только нормативные `absorb` и `diffuse`.

```pseudo
function absorb(frame, domain, payload, rounds):
    data = domainByte + littleEndian32(byteLength(payload)) + payload
    for each byte b at index i:
        lane = i modulo 8
        s = substitute((b + domain + (i modulo 251)) modulo 256)
        m = mul32(frame[lane] XOR (s OR ((i modulo 256) leftShift 8)), M[lane])
        frame[lane] = add32(rotateLeft32(m, (i modulo 31)+1), A[(lane+i) modulo 8])
        other = (lane+3) modulo 8
        frame[other] = frame[other] XOR
            rotateLeft32(add32(s, i), ((lane*3+i) modulo 31)+1)
    return diffuse(frame, rounds)

function diffuse(frame, rounds):
    for r in range(0, rounds):
        old = copy(frame)
        for i in range(0, 8):
            j = P[i]
            mixed = mul32(
                old[j] XOR rotateLeft32(old[(j+3) modulo 8], ((r+i) modulo 31)+1),
                M[(i+r) modulo 8]
            )
            frame[i] = add32(
                rotateLeft32(mixed, ((i*5+r*3) modulo 31)+1),
                A[(i+2*r) modulo 8]
            ) XOR old[(i+1) modulo 8]
    return frame
```

## 6. ConversionCheckpoint

```pseudo
function matches(profile, journey, clickId, pulse, score, propertiesJson, serverTime, scorePrefix) -> bool:
    try:
        require profile == "cv2"
        require journey is valid absolute API path of <= 512 bytes
        require clickId matches /^[0-9a-f]{32}$/
        require score matches /^[0-9a-f]{64}$/
        require scorePrefix in ["", "0", "00", "000"]
        require score startsWith scorePrefix
        [timestamp, parts] = PulseCodec.parseAndCheck(pulse, serverTime)
        properties = PropertyCodec.parse(propertiesJson)
        require PropertyCodec.canonicalJson(properties) == propertiesJson

        context = JourneyContext(
            journey = actualServerRoute,       // Не путь из тела запроса.
            expectedServerTag = env TELEMETRY_TAG,
            properties = properties,
            clickIdBytes = ClickCodec.decode(clickId),
            timestamp = timestamp,
            pulseParts = parts
        )
        require journey == context.journey

        frame = INITIAL
        frames = empty map
        for stage in [JourneyStage, TouchpointStage, PropertiesStage, ClickStage, PulseStage]:
            frame = stage.apply(frame, context)
            frames[stage.name] = frame       // Для fixture-тестов.

        expectedScore = littleEndianLanesToLowerHex(frame)
        return hash_equals(expectedScore, score)
    catch any expected input/format exception:
        return false
```

HTTP-слой позднее будет читать ровно три cv2 headers и возвращать одинаковый `403` для любой ошибки:

```pseudo
measurementId = header("X-GA-Measurement-Id")
require measurementId == env TELEMETRY_PROJECT_ID
pulse = header("X-GA-Session-Id")
envelopeJson = strictBase64UrlDecode(header("X-GA-Session-Properties"))
envelope = strictJsonObject(envelopeJson)
require keys(envelope) == ["client", "eid", "props", "sum", "v"] in this order
require deterministicJson(envelope) == envelopeJson
require envelope.client == "v2.10.4-pixel"
propertiesJson = deterministicJson(envelope.props)
matches(envelope.v, actualServerRoute, envelope.eid, pulse, envelope.sum, propertiesJson, serverTime, configuredPrefix)
```

Неизвестные/отсутствующие поля, padding, неканонический JSON и legacy `X-Amplitude-*`/`X-YM-*` headers не используются как альтернативный transport.

## 7. Минимальный набор будущих тестов

1. Все промежуточные кадры и `score` каждого fixture совпадают с Rust.
2. Все `pulse` декодируются и повторно кодируются без изменений.
3. Канонический JSON и бинарные свойства совпадают с fixtures, включая UTF-8.
4. Fallback-fixtures не проходят с ожидаемым настоящим `TELEMETRY_TAG`.
5. Изменение пути, свойства, тега, clickId, времени или одного hex-символа даёт `false`; score без настроенного prefix также отклоняется.
6. Некорректные hex, JSON, base64url, дубли и превышение лимитов дают `false` без warnings.
7. Timestamp ровно на границах past=30/future=5 принимается; более старый и более далёкий будущий отклоняются.
8. Differential-тест на одинаковых случайных входах сравнивает Rust и PHP после каждой стадии.

## 8. Будущий `pa1` mirror

TypeScript product analytics требует собственной проверки и не должен использовать классы `cv2` как готовый alias. Нормативный источник — `contracts/product-analytics-v1.md` и его fixtures.

Предлагаемые независимые компоненты:

```text
PageUInt32          Четыре lanes, add/sub/mul/rotate без float.
PagePulseCodec      Обратимое время pa1.
PageIdentifier      Строгие 32 hex ↔ 16 bytes для viewId/eventId.
PageFrameReducer    Стадии page/view/event/time.
ProductCheckpoint   Project ID, три headers, strict envelope, TTL и score.
```

`ProductCheckpoint` проверяет `X-PA-Measurement-Id` через project configuration, декодирует `X-PA-Session-Id` и strict envelope из `X-PA-Session-Properties` с полями `data,eid,sum,v`. Он использует фактический route и server-configured `data-view`, повторяет `pa1`, проверяет размер analytics snapshot и возвращает generic 403 для любой ошибки. Graphics/engagement не входят в score.

После синхронной проверки backend может передать `data` из envelope во внутренний сервис обработки признаков. Эта передача и сама аналитика отложены и не блокируют текущий запрос.
