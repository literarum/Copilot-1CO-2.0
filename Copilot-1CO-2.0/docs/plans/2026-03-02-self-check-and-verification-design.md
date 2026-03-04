# Дизайн: надёжная система самопроверки и верификации Copilot 1CO

> **Цель:** Обеспечить профессиональный уровень контроля качества — самопроверку, CI-подобный pipeline, прогон тестов, линт и исправление ошибок; устроить «консенсус агентов» для кросс-проверки.

**Дата:** 2026-03-02

---

## 1. Контекст и мотивация

- Приложение проверяет отзыв сертификатов (revocation) через API (`/api/revocation/check`), сервисы (`RevocationService`), Yandex Cloud Function handler (`yandex-function/crl-checker/index.js`) и фичу FNS (`fns-cert-revocation.js`).
- Тесты уже есть: `api/revocation/check.test.js`, `api/revocation/yandex-handler.test.js`, `site/js/features/fns-cert-revocation*.test.js`.
- Отсутствует единый, воспроизводимый и документированный pipeline проверки «как у профессиональной команды».

---

## 2. Архитектура самопроверки

### 2.1. Компоненты

| Компонент                               | Назначение                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `scripts/verify.sh`                     | Основной скрипт верификации: lint → format-check → test; exit code 0 = все проверки пройдены |
| `package.json` scripts                  | `verify`, `verify:lint`, `verify:test`, `verify:quick`                                       |
| `docs/plans/revocation-api-contract.md` | Референсный контракт API (уже есть)                                                          |
| Design doc (этот файл)                  | Спецификация и чек-листы для «консенсуса агентов»                                            |

### 2.2. Pipeline (порядок проверок)

1. **Lint** (`npm run lint`) — ESLint по `site/js/**`, `api/**`, `yandex-function/**`
2. **Format** — Prettier check (`--check`) без записи
3. **Test** (`npm test -- --run`) — все Vitest тесты

Условие успеха: все шаги завершаются с exit code 0.

### 2.3. «Консенсус агентов»

Набор критериев, по которым агенты/разработчики должны консенсовать перед merge:

- [ ] Все тесты проходят (`npm test -- --run`)
- [ ] Линт чист (`npm run lint`)
- [ ] Формат соблюдён (`npm run format` + diff = 0)
- [ ] Контракт API (`docs/plans/revocation-api-contract.md`) соблюдается в коде
- [ ] Критичные пути проверки отзыва покрыты тестами (API, Yandex handler, parser, UI smoke)

---

## 3. Обработка ошибок и восстановление

- При падении любого шага `verify.sh` выводит явное сообщение и возвращает ненулевой exit code.
- Рекомендуемый порядок исправлений: сначала тесты, затем линт, затем формат.
- Документация по типичным ошибкам — в секции «Troubleshooting» скрипта (комментарии).

---

## 4. Интеграция с CI (будущее)

- Скрипт `verify.sh` спроектирован так, чтобы его можно было вызывать из GitHub Actions или другого CI.
- Пример: `./scripts/verify.sh` в `on: [push, pull_request]`.

---

## 5. Критерии приёмки (Acceptance Criteria)

- [x] Исправлены все падающие тесты (2 падения в `fns-cert-revocation.test.js` — исправлено добавлением `document.addEventListener` в mock)
- [x] Существует `scripts/verify.sh`, выполняющий lint → format-check → test
- [x] В `package.json` есть команда `verify`, вызывающая этот pipeline
- [x] `./scripts/verify.sh` завершается с кодом 0 при успехе
- [x] Чек-лист «консенсус агентов» задокументирован в разделе 2.3

---

## 6. Ограничения и YAGNI

- Не внедряем сложный CI (GitHub Actions) в рамках этого дизайна — только локальный pipeline.
- parallel-cli остаётся опциональным: установка вручную при необходимости глубокого research.
- Не дублируем логику тестов — используем существующий Vitest.
