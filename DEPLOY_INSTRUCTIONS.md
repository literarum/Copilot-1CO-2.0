# Инструкции по деплою в Yandex Cloud

## Архитектура

- Backend: Yandex Cloud Function `crl-checker` (Node.js 22) **за API Gateway**.
- API Gateway: маршруты `/api/health` и `/api/revocation/check` проксируются в функцию; без шлюза запросы с путём дают 400.
- Frontend: Object Storage static hosting.
- Связка фронта и API: `site/js/config.js -> REVOCATION_API_BASE_URL` — **обязательно URL API Gateway**, не прямой URL функции.

## 0) API Gateway (обязательно для вызова по path)

Прямой URL функции (`https://functions.yandexcloud.net/<FUNCTION_ID>`) **не поддерживает path**: запросы вида `.../api/health` или `.../api/revocation/check` приводят к 400 и блокировке CORS. Нужен API Gateway перед функцией.

**Пошагово:**

1. Откройте [Yandex Cloud Console](https://console.cloud.yandex.ru) → каталог с функцией → **API Gateway**.
2. Нажмите **Создать API Gateway**. Имя, например: `copilot-1co-revocation`.
3. В поле спецификации вставьте содержимое файла `yandex-function/api-gateway-openapi.yaml` из репозитория.
4. Замените во вставленной спецификации все вхождения **`<FUNCTION_ID>`** на идентификатор вашей функции (например `d4ek2is78822funrr85b`). Сохраните.
5. После создания скопируйте **URL шлюза** (вид `https://<id>.apigw.yandexcloud.net` или указанный домен).
6. В `site/js/config.js` задайте:
    ```js
    export const REVOCATION_API_BASE_URL = 'https://<id>.apigw.yandexcloud.net';
    ```
    (без завершающего слэша).

Проверка после деплоя: `curl "https://<id>.apigw.yandexcloud.net/api/health"` должен вернуть `{"ok":true,...}`.

## 1) Обновить функцию `crl-checker`

1. Откройте функцию `crl-checker` в Yandex Cloud Console.
2. Runtime: `Node.js 22`.
3. Entry point: `index.handler`.
4. Вставьте содержимое `yandex-function/crl-checker/index.js` в редактор функции.
5. Рекомендуемые параметры:
    - Timeout: `60s`
    - **Memory: не менее `1024 MB` (1 ГБ)** — при 512 MB возможен 502 и в логах «killed by signal 9» (OOM при загрузке/разборе крупных CRL).
6. Опубликуйте новую версию.
7. Включите публичный доступ (Allow unauthenticated invoke). Вызов с сайта идёт через API Gateway (см. шаг 0), не по прямому URL функции.

## 2) Проверить URL API Gateway

Используйте **URL шлюза** (не прямой URL функции):

Проверка health:

```bash
curl "https://<API_GATEWAY_ID>.apigw.yandexcloud.net/api/health"
```

Проверка API:

```bash
curl --request POST "https://<API_GATEWAY_ID>.apigw.yandexcloud.net/api/revocation/check" \
  --header "Content-Type: application/json" \
  --data '{"serial":"01AB","listUrl":"https://pki.tax.gov.ru/cdp/test.crl"}'
```

## 3) Настроить фронтенд

В `site/js/config.js` укажите **URL API Gateway** (из шага 0):

```js
export const REVOCATION_API_BASE_URL = 'https://<API_GATEWAY_ID>.apigw.yandexcloud.net';
```

## 4) Деплой статики в Object Storage

1. Создайте bucket.
2. Включите:
    - публичный доступ к объектам;
    - публичный доступ к списку объектов.
3. Включите static hosting:
    - `index.html` как Index document;
    - `index.html` или отдельный error-файл как Error document.
4. Загрузите содержимое папки `site/` в bucket.
5. Откройте сайт по URL:
    - `https://<bucket>.s3-web.yandexcloud.net`

## 5) Контроль лимитов free-tier

- Cloud Functions: `1,000,000` вызовов и `10 GB*hour` в месяц бесплатно.
- Object Storage: `1 GB`, `10,000` PUT/POST/PATCH/LIST и `100,000` GET/HEAD/OPTIONS в месяц бесплатно.

Периодически проверяйте актуальные лимиты в официальной документации Yandex Cloud.
