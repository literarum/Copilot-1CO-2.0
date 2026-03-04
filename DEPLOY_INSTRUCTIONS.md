# Инструкции по деплою в Yandex Cloud

## Архитектура

- Backend: Yandex Cloud Function `crl-checker` (Node.js 22).
- Frontend: Object Storage static hosting.
- Связка фронта и API: `site/js/config.js -> REVOCATION_API_BASE_URL`.

## 1) Обновить функцию `crl-checker`

1. Откройте функцию `crl-checker` в Yandex Cloud Console.
2. Runtime: `Node.js 22`.
3. Entry point: `index.handler`.
4. Вставьте содержимое `yandex-function/crl-checker/index.js` в редактор функции.
5. Рекомендуемые параметры:
    - Timeout: `60s`
    - Memory: `512 MB`
6. Опубликуйте новую версию.
7. Включите публичный доступ (Allow unauthenticated invoke). Для вызова с сайта (в т.ч. GitHub Pages) нужен именно HTTP-триггер с публичным доступом — иначе возможны 400 и блокировка CORS при preflight.

## 2) Проверить function URL

Проверка health:

```bash
curl "https://functions.yandexcloud.net/<FUNCTION_ID>/api/health"
```

Проверка API:

```bash
curl --request POST "https://functions.yandexcloud.net/<FUNCTION_ID>/api/revocation/check" \
  --header "Content-Type: application/json" \
  --data '{"serial":"01AB","listUrl":"https://pki.tax.gov.ru/cdp/test.crl"}'
```

## 3) Настроить фронтенд

В `site/js/config.js` укажите:

```js
export const REVOCATION_API_BASE_URL = 'https://functions.yandexcloud.net/<FUNCTION_ID>';
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
