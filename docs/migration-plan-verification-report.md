# Отчёт верификации плана миграции (Consensus Deep Planning)

**Дата проверки:** 4 марта 2026  
**Проверяемый документ:** План миграции крупных блоков кода (обновление 6 февраля 2026)

---

## MASTER PLAN (верификация)

**GOAL:** Установить по кодовой базе, какие этапы плана миграции выполнены на текущий момент.

**SUCCESS_CRITERIA:** Для каждого из этапов 1–6 зафиксирован статус (DONE / NOT_DONE) с указанием путей к файлам и номеров строк.

**CONSTRAINTS:** Только факты из чтения файлов и grep; без предположений.

**ASSUMPTIONS:** Репозиторий в актуальном состоянии; план ссылается на `site/script.js` и модули в `site/js/`.

---

## EVIDENCE (сводка по этапам)

### Текущее состояние script.js

- **Путь:** `site/script.js`
- **Число строк:** **5 167** (в плане указано ~4 048 — расхождение с текущим состоянием)
- **Определения целевых функций в script.js (подтверждено grep):**
  - `ensureSearchIndexIsBuilt` — стр. 1386
  - `loadCategoryInfo` — стр. 1427
  - `saveCategoryInfo` — стр. 1442
  - `loadUISettings` — стр. 1505
  - `saveUISettings` — стр. 1536
  - `showNotification` — стр. 1667
  - `_applyThemeClass` — стр. 2313
  - `_onSystemThemeChange` — стр. 2328
  - `initClientDataSystem` — стр. 3485
  - `ensureInnPreviewStyles` — стр. 3788

---

### Этап 1: Миграция showNotification

| Шаг в плане | Статус | Доказательство |
|-------------|--------|----------------|
| 1. Проверить NotificationService в `js/services/notification.js` | ✅ DONE | Файл существует, `NotificationService` реализован (`site/js/services/notification.js`) |
| 2. Добавить showNotification в NotificationService или отдельную функцию | ❌ NOT_DONE | В `notification.js` нет функции `showNotification(message, type, duration)`. В `site/js/features/notification-inline.js` есть своя реализация `showNotification`, но это отдельный модуль, не подмена script.js |
| 3. Экспортировать из модуля | ❌ NOT_DONE | В `notification.js` экспортируется только `NotificationService` |
| 4. Импортировать в script.js | ❌ NOT_DONE | script.js не импортирует showNotification из notification.js |
| 5. Заменить вызовы в script.js на импорт | ❌ NOT_DONE | В script.js по-прежнему локальная `function showNotification` (стр. 1667) |
| 6. Удалить старую функцию из script.js | ❌ NOT_DONE | Функция на месте |
| 7. Обновить зависимости | ❌ NOT_DONE | Не применимо |

**Итог этапа 1:** Выполнен только шаг 1. Миграция `showNotification` в `js/services/notification.js` **не выполнена**.

---

### Этап 2: Миграция initClientDataSystem и связанных

| Шаг в плане | Статус | Доказательство |
|-------------|--------|----------------|
| 1. Найти createClientNotesInnPreview и др. | — | Не проверялось в рамках верификации |
| 2. Создать `js/features/client-data-init.js` | ❌ NOT_DONE | Файл **не существует** (glob поиск: 0 файлов) |
| 3–10. Миграция, DI, экспорт, замена в script.js, удаление из script.js | ❌ NOT_DONE | `initClientDataSystem` и `ensureInnPreviewStyles` по-прежнему в script.js (3485, 3788) |

**Итог этапа 2:** **Не выполнен.** Модуль `client-data-init.js` не создан, код остаётся в script.js.

---

### Этап 3: Миграция loadUISettings и saveUISettings

| Шаг в плане | Статус | Доказательство |
|-------------|--------|----------------|
| 1. Открыть js/ui/ui-settings.js | ✅ | Файл существует |
| 2–3. Добавить loadUISettings и saveUISettings в модуль | ❌ NOT_DONE | В `site/js/ui/ui-settings.js` есть `applyUISettings`, `setUISettingsDependencies`; **нет** `loadUISettings` и `saveUISettings` |
| 4–8. DI, экспорт, импорт в script.js, замена, удаление | ❌ NOT_DONE | `loadUISettings` и `saveUISettings` определены только в script.js (1505, 1536) |

**Итог этапа 3:** **Не выполнен.** Функции остаются в script.js.

---

### Этап 4: Миграция loadCategoryInfo и saveCategoryInfo

| Шаг в плане | Статус | Доказательство |
|-------------|--------|----------------|
| Целевой модуль по плану | — | `js/components/reglaments.js` |
| 2–3. Добавить loadCategoryInfo и saveCategoryInfo в reglaments.js | ❌ NOT_DONE | В `site/js/components/reglaments.js` нет `loadCategoryInfo` и `saveCategoryInfo` (есть `populateReglamentCategoryDropdowns` и др.) |
| Остальные шаги | ❌ NOT_DONE | В script.js по-прежнему свои реализации (1427, 1442) |

**Примечание:** В `site/js/features/legacy-helpers.js` реализованы и экспортируются `loadCategoryInfo` и `saveCategoryInfo`, но по плану целевой модуль — **reglaments.js**. script.js не переведён на импорт из legacy-helpers и не удалил свой код; дублирование остаётся.

**Итог этапа 4:** **Не выполнен** (в смысле плана: перенос в reglaments.js и удаление из script.js).

---

### Этап 5: Миграция _applyThemeClass и _onSystemThemeChange

| Шаг в плане | Статус | Доказательство |
|-------------|--------|----------------|
| Целевой модуль | — | `js/components/theme.js` |
| 2–3. Добавить applyThemeClass и onSystemThemeChange в theme.js | ❌ NOT_DONE | В `site/js/components/theme.js` есть `setTheme`, `migrateLegacyThemeVars`, `updateThemeToggleButtonIcons`; **нет** `applyThemeClass` / `onSystemThemeChange` |
| 4–7. Экспорт, импорт в script.js, замена, удаление | ❌ NOT_DONE | В script.js по-прежнему `_applyThemeClass` (2313), `_onSystemThemeChange` (2328) |

**Итог этапа 5:** **Не выполнен.**

---

### Этап 6: Миграция ensureSearchIndexIsBuilt

| Шаг в плане | Статус | Доказательство |
|-------------|--------|----------------|
| Целевой модуль | — | `js/features/search.js` |
| 2–3. Добавить ensureSearchIndexIsBuilt в search.js | ❌ NOT_DONE | В `site/js/features/search.js` нет экспорта/реализации `ensureSearchIndexIsBuilt` |
| 4–7. Экспорт, импорт в script.js, замена, удаление | ❌ NOT_DONE | В script.js по-прежнему своя реализация (1386) |

**Примечание:** В `site/js/features/legacy-helpers.js` есть и экспортируется `ensureSearchIndexIsBuilt`, но план указывает целевой модуль **search.js**. script.js не переведён на него и не удалил свою функцию.

**Итог этапа 6:** **Не выполнен** (в смысле плана: перенос в search.js и удаление из script.js).

---

## PLAN_CONSENSUS (верификация)

**Executor:** Проверка выполнена по репозиторию: подсчёт строк script.js, поиск целевых функций в script.js и в целевых модулях (notification.js, ui-settings.js, reglaments.js, theme.js, search.js), проверка наличия client-data-init.js. Итог: этапы 2–6 не выполнены; этап 1 выполнен только в части шага 1.

**Critic:** (1) Размер script.js вырос до 5 167 строк — цель «<3 000 строк» не достигнута. (2) legacy-helpers.js содержит реализации, альтернативные плану (reglaments.js / search.js) — либо обновить план, либо довести миграцию до целевых модулей и убрать дубли в script.js. (3) notification-inline.js дублирует showNotification — нужна ясность: это временный слой или забытый дубликат.

**Architect:** APPROVED. Отчёт основан на доказательствах из файловой системы; расхождения с планом и альтернативные реализации (legacy-helpers) явно отмечены.

---

## Итоговый ответ на вопрос «всё ли выполнено по плану»

**Нет.** По состоянию на текущий момент:

- **Этап 1:** Выполнен только шаг 1 (проверка NotificationService). Шаги 2–7 (перенос `showNotification`, удаление из script.js) **не выполнены**.
- **Этапы 2, 3, 4, 5, 6:** **Не выполнены.** Все перечисленные в плане функции по-прежнему определены в `site/script.js`; целевые модули либо не созданы (client-data-init.js), либо не содержат соответствующих функций (ui-settings.js, reglaments.js, theme.js, search.js).

**Дополнительно:** В плане отмечено «Дополнительно завершено» — перенос логики в `site/` (onload-handler, ui-settings-modal-init, theme-toggle, app-init и т.д.). Это отдельно от этапов 1–6 и в данном отчёте не перепроверялось.

---

**Файлы, использованные при верификации:**  
`site/script.js`, `site/js/services/notification.js`, `site/js/features/notification-inline.js`, `site/js/ui/ui-settings.js`, `site/js/features/legacy-helpers.js`, `site/js/components/theme.js`, `site/js/features/search.js`, `site/js/components/reglaments.js`

---

## Обновление от 4 марта 2026 — миграция выполнена

Все этапы 1–6 плана миграции выполнены (consensus-deep-planning):

- **Этап 1:** `showNotification` перенесена в `js/services/notification.js`, экспорт и импорт в script.js.
- **Этап 2:** Создан `js/features/client-data-init.js`, перенесены `initClientDataSystem` и `ensureInnPreviewStyles`, настроен `setClientDataInitDependencies`.
- **Этап 3:** `loadUISettings` и `saveUISettings` перенесены в `js/ui/ui-settings.js`, в deps добавлены `getSettingsFromModal` и `saveUserPreferences`.
- **Этап 4:** `loadCategoryInfo` и `saveCategoryInfo` перенесены в `js/components/reglaments.js`, в deps добавлен `CATEGORY_INFO_KEY`.
- **Этап 5:** `applyThemeClass` и `onSystemThemeChange` перенесены в `js/components/theme.js`.
- **Этап 6:** `ensureSearchIndexIsBuilt` перенесена в `js/features/search.js`.

**Текущий размер script.js:** ~4 460 строк (до миграции ~5 167). Линтер без ошибок.
