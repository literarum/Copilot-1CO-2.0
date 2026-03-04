# Контракт API проверки отзыва сертификатов

## Базовые сведения

- **Назначение:** проверка статуса отзыва сертификата по серийному номеру и URL списка отзыва.
- **Основные маршруты:**
    - `GET /api/revocation/check`
    - `POST /api/revocation/check`
    - `GET /api/health`

## Форматы запросов

### GET `/api/revocation/check`

- **Параметры query:**
    - `serial` — строка, серийный номер сертификата (обязательный).
    - `listUrl` — строка, URL источника списка отозванных сертификатов (обязательный).

**Пример:**

```text
GET /api/revocation/check?serial=01AB23CD&listUrl=https%3A%2F%2Fexample.com%2Fcrl.pem
```

### POST `/api/revocation/check`

- **Тело JSON:**
    - `serial` или `certSerial` — строка, серийный номер сертификата (обязательный).
    - `listUrl` или `crlUrl` или `list_url` — строка, URL источника списка отозванных сертификатов (обязательный).

**Пример:**

```json
{
    "serial": "01AB23CD",
    "listUrl": "https://example.com/crl.pem"
}
```

## Форматы ответов

### Успешный ответ проверки

```json
{
    "revoked": false,
    "serial": "01AB23CD"
}
```

- `revoked`: `true` — сертификат найден в списке отозванных; `false` — не найден / ошибка.
- `serial`: нормализованный серийный номер (верхний регистр, без ведущих нулей).

### Ответ с ошибкой

```json
{
    "revoked": false,
    "error": "CRL parse error: ...",
    "serial": "01AB23CD"
}
```

- `error`: человекочитаемое описание проблемы (`missing listUrl`, `invalid JSON body`, `list URL returned 404`, `failed to fetch list: ...`, `CRL parse error: ...`).
- `serial`: при наличии исходного серийного номера возвращается нормализованное значение.

### Health-check

```json
{
    "ok": true,
    "service": "copilot-1co-revocation"
}
```

## Типы источников списков отзыва

- **JSON (`Content-Type: application/json`)**
    - Ожидается либо массив строк/объектов, либо объект с полями `revoked` / `serials` / `list`.
    - Серийный номер берётся либо как строка-элемент, либо как поле `serial`.

- **CRL (X.509, DER/PEM)**
    - `Content-Type` включает:
        - `application/x-x509-crl`
        - `application/pkix-crl`
        - `application/octet-stream`
    - Либо URL оканчивается на `.crl`, либо тип не текстовый.
    - Парсинг выполняется функцией `parseCrlRevokedSerials`.

- **Текстовый список**
    - Любой текстовый ответ (`text/*`), не удовлетворяющий условиям выше.
    - Разбивается по строкам, каждая строка трактуется как потенциальный серийный номер.

## Поведение при ошибках

- Отсутствие или некорректность `serial` / `listUrl` → `revoked: false`, `error` с описанием.
- Ошибка сети при запросе списка → `revoked: false`, `error: "failed to fetch list: ..."` .
- Невалидный ответ CRL → `revoked: false`, `error: "CRL parse error: ..."` .
- Неверный HTTP-статус списка → `revoked: false`, `error: "list URL returned <status>"`.

## Согласование фронтенда и backend

- Фронтенд всегда обращается к API через единый сервис (например, `revocationService`), который:
    - Формирует запросы строго по этому контракту.
    - Нормализует и отображает ошибки пользователю в унифицированном виде.
- При добавлении новых типов источников (например, баз данных или других форматов) изменения концентрируются в backend и, при необходимости, в тонком адаптере на стороне сервиса, без изменения UI.
