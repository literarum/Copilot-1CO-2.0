# Инструкции по деплою

## Быстрый старт

### 1. Закоммитить и запушить изменения

```bash
git add worker/ .github/workflows/deploy-worker-cloudflare.yml site/js/config.js site/js/features/fns-cert-revocation.js wrangler.toml
git commit -m "Add Cloudflare Worker for certificate revocation check API"
git push origin main
```

(Если работаете в ветке safe-work: `git push origin safe-work`, затем сделайте merge в main через Pull Request)

### 2. Добавить секреты в GitHub

1. Откройте репозиторий на GitHub
2. Settings → Secrets and variables → Actions → New repository secret
3. Добавьте два секрета:
   - **`CLOUDFLARE_API_TOKEN`** — API Token с правами Workers Scripts: Edit
     (Cloudflare Dashboard → My Profile → API Tokens → Create Token)
   - **`CLOUDFLARE_ACCOUNT_ID`** — ID аккаунта (видно в Cloudflare Dashboard справа в сайдбаре)

### 3. Настроить Cloudflare Dashboard (Вариант B)

1. Откройте https://dash.cloudflare.com
2. Workers & Pages → ваш проект (или создайте новый, подключив репозиторий `literarum/Copilot-1CO-2.0`)
3. Settings → Build configuration (или Builds & deployments)
4. Укажите **Root directory**: `worker`
5. Сохраните

После этого Cloudflare будет использовать `worker/wrangler.toml` и `worker/src/index.js`.

### 4. После первого деплоя

**Через GitHub Actions:**
- Откройте Actions → последний run "Deploy Revocation Worker (Cloudflare)"
- В логах шага "Deploy Worker to Cloudflare" найдите URL вида:
  `https://copilot-1co-revocation.xxxx.workers.dev`

**Или через Cloudflare Dashboard:**
- Workers & Pages → ваш проект → вверху будет показан URL Worker

**Затем:**
1. Скопируйте URL Worker
2. Откройте `site/js/config.js`
3. Замените пустую строку на URL:
   ```js
   export const REVOCATION_API_BASE_URL = 'https://copilot-1co-revocation.xxxx.workers.dev';
   ```
4. Закоммитьте и запушьте:
   ```bash
   git add site/js/config.js
   git commit -m "Configure Worker API URL"
   git push origin main
   ```

## Что происходит автоматически

- При каждом пуше в `main`:
  - **GitHub Actions** деплоит Worker в Cloudflare (если секреты настроены)
  - **GitHub Actions** деплоит `site/` на GitHub Pages
- Фронтенд на GitHub Pages автоматически использует Worker API для проверки отзыва (если `REVOCATION_API_BASE_URL` задан)
