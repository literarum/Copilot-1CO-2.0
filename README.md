# Copilot 1CO - Система поддержки 1С

<!-- trigger deploy -->

## 🚀 Быстрый старт

### Запуск приложения

Приложение использует ES6 модули, поэтому требуется HTTP-сервер:

**Windows PowerShell:**

```powershell
.\start-server.ps1
```

**Windows CMD:**

```cmd
start-server.bat
```

**Вручную (любая ОС):**

```bash
python -m http.server 8000
```

Затем откройте в браузере: **http://localhost:8000**

### Деплой на Yandex Cloud (free-tier)

Целевая схема миграции:

- **Backend API**: `yandex-function/crl-checker/index.js` в Yandex Cloud Functions (Node.js 22).
- **Frontend статика**: папка `site/` в Object Storage с включенным static hosting.

#### 1) Деплой функции `crl-checker`

1. В консоли Yandex Cloud откройте вашу функцию `crl-checker`.
2. Runtime: **Node.js 22**.
3. Entry point: **`index.handler`**.
4. Вставьте код из `yandex-function/crl-checker/index.js` в редактор функции (или загрузите ZIP с этим файлом как `index.js`).
5. Параметры версии:
    - Timeout: рекомендуется `60s`.
    - Memory: `512 MB` (рекомендуемое значение для текущей функции).
6. Сделайте функцию публичной (Allow unauthenticated invoke), чтобы фронт мог вызывать API из браузера.
7. Скопируйте `https://functions.yandexcloud.net/<FUNCTION_ID>` (invoke URL).

Проверка:

```bash
curl "https://functions.yandexcloud.net/<FUNCTION_ID>/api/health"
```

Ожидается JSON с `ok: true`.

#### 2) Подключение фронта к функции

В `site/js/config.js` укажите URL функции:

```js
export const REVOCATION_API_BASE_URL = 'https://functions.yandexcloud.net/<FUNCTION_ID>';
```

После этого фронт будет ходить в Yandex Function по `POST/GET /api/revocation/check`.

#### 3) Деплой статики в Object Storage

1. Создайте bucket в Object Storage.
2. Включите публичный доступ к объектам и списку объектов.
3. Включите static hosting:
    - Index document: `index.html`
    - Error document: `index.html` (для SPA-маршрутов) или отдельная ошибка.
4. Загрузите содержимое папки `site/` в bucket.
5. Откройте URL вида `https://<bucket>.s3-web.yandexcloud.net`.

#### 4) Free-tier (подтверждено документацией)

- Cloud Functions: `1,000,000` вызовов и `10 GB*hour` в месяц бесплатно.
- Object Storage: `1 GB` хранения, `10,000` PUT/POST/PATCH/LIST и `100,000` GET/HEAD/OPTIONS в месяц бесплатно.

Примечание: лимиты и тарифы периодически меняются, перед продом сверяйте текущие значения в Yandex Cloud billing docs.

#### Как открыть PR с миграцией (из этой папки)

1. Из корня репозитория выполните: **`bash sync-and-push-pr.sh`**
2. Скрипт при необходимости клонирует `literarum/Copilot-1CO-2.0` в подпапку `Copilot-1CO-2.0`, синхронизирует файлы, спросит подтверждение и сделает коммит и пуш ветки `feat/yandex-cloud-migration`.
3. В конце скрипт выведет ссылку на сравнение веток — откройте её в браузере и нажмите **Create pull request** (base: `main`, compare: `feat/yandex-cloud-migration`).

**Создание PR и превью сайта:** при выполнении **`./scripts/publish-pr.sh main`** создаётся новая ветка и PR. Workflow «PR Preview» (файл `.github/workflows/pr-preview.yml` **должен быть в ветке main**) автоматически деплоит `site/` в каталог превью на GitHub Pages и оставляет в PR комментарий со ссылкой. Формат ссылки: **`https://<owner>.github.io/<repo>/pr-preview/pr-<номер>/`**. В репозитории: Actions включены, **Pages → Source: Deploy from a branch**, ветка **gh-pages**. Если в PR «0 Checks» — в main ещё нет актуального `pr-preview.yml`; влейте его в main один раз, дальше всё будет автоматически.

### Проверка отзыва сертификатов ФНС

Если в `site/js/config.js` задан **REVOCATION_API_BASE_URL** (например, Yandex Cloud Function), проверка отзыва выполняется через облако: CRL загружает сама функция, локальный helper не нужен.

**Локальный helper** (опционально): чтобы загрузка CRL шла с вашего ПК (удобно, если доступ к ФНС только с вашей сети), запустите на этом компьютере **локальный CRL-helper**:

```bash
npm run helper:crl
```

Требуется Node.js 18+. Подробнее: [helper/README.md](helper/README.md).

**Если приложение открыто с GitHub Pages** (`literarum.github.io`): команда установки хелпера в разделе «Проверка сертификата» берёт URL с текущего origin. Если она возвращает 404, в интерфейсе есть запасная команда (скрипт с raw GitHub). После push в `main` workflow «Deploy Pages» публикует папку `site/` в корень gh-pages (включая `install-mac.sh`, `install-linux.sh`, `install-windows.ps1` и `files/`).

### Тестирование модулей

Для проверки корректности загрузки всех модулей:

```
http://localhost:8000/test-modules.html
```

### Самопроверка перед merge (verify)

Перед внесением изменений рекомендуется прогонять полный pipeline:

```bash
npm run verify
```

Выполняет: lint → format check → тесты. Exit 0 = все проверки пройдены.

- `npm run verify:quick` — только тесты (без lint/format)
- Подробнее: [docs/plans/2026-03-02-self-check-and-verification-design.md](docs/plans/2026-03-02-self-check-and-verification-design.md)

## 📁 Структура проекта

```
1cohelp/
├── index.html              # Главная страница приложения
├── script.js              # Главный исполняемый файл (использует модули)
├── js/                    # Модульная структура
│   ├── entry.js           # Точка входа для связывания зависимостей
│   ├── app.js             # Инициализация приложения
│   ├── constants.js       # Константы
│   ├── config.js          # Конфигурация
│   ├── app/
│   │   └── state.js       # Глобальное состояние
│   ├── components/        # UI компоненты
│   │   ├── algorithms.js
│   │   ├── bookmarks.js
│   │   ├── main-algorithm.js
│   │   ├── modals.js
│   │   ├── tabs.js
│   │   ├── theme.js
│   │   ├── client-data.js
│   │   ├── ext-links.js
│   │   ├── reglaments.js
│   │   └── sedo.js
│   ├── db/               # База данных
│   │   ├── indexeddb.js
│   │   ├── favorites.js
│   │   └── stores.js
│   ├── services/         # Сервисы
│   │   ├── notification.js
│   │   └── export.js
│   └── utils/            # Утилиты
│       ├── helpers.js
│       └── html.js
├── MIGRATION_REPORT.md   # Полный отчет о миграции проекта
├── README.md             # Основная документация проекта
└── start-server.*        # Скрипты запуска сервера
```

## ✨ Основные возможности

- 📚 **База алгоритмов** - быстрый поиск решений проблем 1С
- 🔖 **Закладки** - сохранение важных алгоритмов
- 🌓 **Темная/светлая тема** - комфортная работа в любое время
- 📤 **Экспорт в PDF** - сохранение инструкций
- 🔍 **Умный поиск** - поиск по категориям и ключевым словам
- 💾 **IndexedDB** - локальное хранилище данных
- 📱 **Адаптивный дизайн** - работает на всех устройствах

## 🛠️ Технологии

- **ES6 Modules** - модульная архитектура
- **IndexedDB** - локальная база данных
- **Tailwind CSS** - стилизация
- **Font Awesome** - иконки
- **jsPDF** - экспорт в PDF

## 📝 Разработка

### Ветки Git

- **main** - стабильная версия (защищена от прямых коммитов)
- **safe-work** - рабочая ветка для разработки

Вся разработка ведется в ветке `safe-work`.

**Как работать:**

1. Всегда работайте в ветке **safe-work**: `git checkout safe-work`
2. Коммиты и пуш — в `safe-work`: `git add ...`, `git commit`, `git push`
3. В **main** не переключайтесь для правок или переключайтесь только чтобы подтянуть обновления: `git checkout main`, `git pull`
4. Когда готово перенести изменения в main — сделайте merge в main (через GitHub Pull Request или локально) и запушьте main.

**Защита main на GitHub:**

- Настройте branch protection rule для `main` в Settings → Branches
- Включите "Require a pull request before merging"
- После этого в `main` нельзя будет пушить напрямую; изменения — только через Pull Request из `safe-work`

### Рефакторинг

Проект был рефакторен из монолитного файла в модульную структуру.
Подробная информация о структуре и миграции в [MIGRATION_REPORT.md](MIGRATION_REPORT.md).

## 🧪 Проверка работоспособности

1. Запустите HTTP-сервер
2. Откройте http://localhost:8000
3. В консоли браузера должны появиться сообщения:
    - `[entry.js] Модули связаны с глобальными зависимостями.`
    - `[App] Модуль приложения загружен.`
4. Не должно быть ошибок импорта

## ⚠️ Важно

- ❌ **Не открывайте через file://** - ES6 модули требуют HTTP-сервер
- ✅ **Используйте локальный сервер** - python, live-server, или встроенные скрипты
- 🌐 **Современный браузер** - требуется поддержка ES6 модулей и IndexedDB

## 📞 Поддержка

Для сообщений об ошибках и предложений:
[Telegram канал](https://t.me/+AXt5_EROQrVkZDE6)

---

**Copilot 1CO** by @guthleifur
