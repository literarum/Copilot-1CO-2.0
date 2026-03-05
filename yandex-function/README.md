# Yandex Cloud Function: `crl-checker`

Готовый handler для Yandex Cloud Functions находится в:

- `yandex-function/crl-checker/index.js`

**Важно:** прямой URL функции (`https://functions.yandexcloud.net/<ID>`) не передаёт в handler path и method — запросы к `.../api/health` и `.../api/revocation/check` дают 400. Нужен **API Gateway**: используйте спецификацию `yandex-function/api-gateway-openapi.yaml` и инструкции в корневом `DEPLOY_INSTRUCTIONS.md` (раздел 0).

## Что поддерживает функция

- `OPTIONS /api/revocation/check` (CORS preflight)
- `GET /api/revocation/check?serial=...&listUrl=...`
- `POST /api/revocation/check` с JSON body:
    - `serial` + `listUrl`
    - или `serial` + `listUrls[]`
    - или `serial` + `crlEntries[]` (гибридный режим)
- `GET /api/health`

## Параметры среды (опционально)

- `REVOCATION_PROXY_URL` — URL внешнего прокси для CRL-запросов.
- `REVOCATION_LOCAL_HELPER_BASE_URL` — URL локального helper-прокси.

## Минимальная настройка в консоли Yandex

1. Runtime: `Node.js 22`
2. Entry point: `index.handler`
3. Memory: `512 MB`
4. Timeout: `60s`
5. Включить public invoke

## Локальная проверка тестов

```bash
npx vitest run api/revocation/yandex-handler.test.js
```

## Устранение 400 и CORS при вызове с браузера (например GitHub Pages)

- **400 Bad Request** по URL `.../api/health` или при preflight: убедитесь, что у функции включён **публичный HTTP-триггер** (вызов по URL), а не только invoke по телу. В консоли Yandex: функция → триггеры → тип «HTTP» / «Прямой вызов», доступ без аутентификации.
- **CORS (preflight не проходит)**: ответ на `OPTIONS` должен быть с кодом 2xx и заголовками `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`. Обработчик уже возвращает 204 и CORS для любого OPTIONS; при сохранении ошибки проверьте, что платформа не возвращает 400/5xx до вызова кода (см. пункт выше).
