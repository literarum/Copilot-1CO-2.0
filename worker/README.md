# Cloudflare Worker: проверка отзыва сертификатов

Бэкенд для проверки сертификатов по спискам отзыва (в т.ч. ФНС). Работает на Cloudflare Workers (бесплатный тариф), обходит CORS при обращении к сайтам списков отзыва.

## Ошибка «Could not find wrangler.json / wrangler.toml»

Она возникает, если в Cloudflare при подключении репозитория указана корневая папка без конфига Wrangler.

**Что сделать:** в настройках проекта в Cloudflare укажите **Root directory** = `worker` (папка, в которой лежит этот `wrangler.toml`). Либо деплойте через GitHub Actions (см. ниже) — тогда папка `worker` используется автоматически.

## Деплой через GitHub Actions

1. В GitHub: **Settings → Secrets and variables → Actions** добавьте секреты:
   - **`CLOUDFLARE_API_TOKEN`** — API-токен с правом *Workers Scripts: Edit*  
     (Cloudflare Dashboard → My Profile → API Tokens → Create Token → шаблон "Edit Cloudflare Workers").
   - **`CLOUDFLARE_ACCOUNT_ID`** — ID аккаунта (в Dashboard справа в сайдбаре).

2. При пуше в `main` с изменениями в `worker/**` workflow **Deploy Revocation Worker (Cloudflare)** задеплоит Worker.

3. После первого деплоя скопируйте URL Worker’а (например `https://copilot-1co-revocation.<поддомен>.workers.dev`) и в репозитории в `site/js/config.js` задайте:
   ```js
   export const REVOCATION_API_BASE_URL = 'https://copilot-1co-revocation.<поддомен>.workers.dev';
   ```

## Локальный деплой (Wrangler CLI)

```bash
cd worker
npm init -y
npx wrangler deploy
```

Перед этим выполните `npx wrangler login` и при необходимости задайте `account_id` в `wrangler.toml` или через переменную окружения.

## API

- **POST /api/revocation/check**  
  Тело: `{ "serial": "серийный номер (hex)", "listUrl": "URL списка отзыва или CRL" }`  
  Ответ: `{ "revoked": true|false, "serial": "...", "error"?: "..." }`

- **GET /api/revocation/check?serial=...&listUrl=...** — то же через query.

- **GET /api/health** или **GET /** — проверка работы сервиса.

Поддерживаются: JSON-массив серийных номеров, текстовый список (по одному на строку), бинарный X.509 CRL (в т.ч. ФНС).
