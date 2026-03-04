# Yandex Cloud Function: `crl-checker`

Готовый handler для Yandex Cloud Functions находится в:

- `yandex-function/crl-checker/index.js`

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
