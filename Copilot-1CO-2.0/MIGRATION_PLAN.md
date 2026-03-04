# План миграции крупных блоков кода

**Дата обновления:** 6 февраля 2026  
**Текущий размер script.js:** ~4,048 строк  
**Цель:** Уменьшить script.js до <3,000 строк (миграция ~1,000+ строк)

---

## 📊 Текущее состояние

### Статистика:

- **script.js:** 4,048 строк (было 12,416 строк)
- **Прогресс миграции:** ~70%
- **Осталось мигрировать:** ~1,000+ строк крупных функций

### Структура script.js:

- **Импорты:** ~400 строк
- **Обертки (wrappers):** ~200 строк
- **Крупные функции:** ~1,000+ строк
- **Event listeners и инициализация:** ~2,400 строк

---

## 🎯 Приоритетные блоки для миграции

### 🔴 Высокий приоритет (крупные функции, >100 строк)

#### 1. `showNotification` (~207 строк)

- **Расположение:** `script.js:1401-1607`
- **Размер:** ~207 строк
- **Описание:** Функция показа уведомлений с анимацией и управлением жизненным циклом
- **Зависимости:**
    - `ensureNotificationIconlessStyles()` (заглушка)
    - DOM API
- **Целевой модуль:** `js/services/notification.js` (расширение)
- **Приоритет:** ⭐⭐⭐⭐⭐
- **Сложность:** Средняя
- **Примечания:** NotificationService уже существует, но `showNotification` осталась в script.js

#### 2. `initClientDataSystem` (~275 строк)

- **Расположение:** `script.js:3115-3389`
- **Размер:** ~275 строк
- **Описание:** Инициализация системы данных клиента с обработчиками событий, превью ИНН, debounce
- **Зависимости:**
    - `ensureInnPreviewStyles()`
    - `createClientNotesInnPreview()` (нужно найти)
    - `saveClientData()`, `checkForBlacklistedInn()`
    - `copyToClipboard()`, `debounce()`
    - `getFromIndexedDB()`, `applyClientNotesFontSize()`
- **Целевой модуль:** `js/features/client-data-init.js` (новый)
- **Приоритет:** ⭐⭐⭐⭐⭐
- **Сложность:** Высокая
- **Примечания:** Очень большая функция с множеством обработчиков событий

#### 3. `ensureInnPreviewStyles` (~20+ строк)

- **Расположение:** `script.js:3391-3412+`
- **Размер:** ~20+ строк
- **Описание:** Создание стилей для превью ИНН
- **Зависимости:** DOM API
- **Целевой модуль:** `js/features/client-data-init.js` (вместе с initClientDataSystem)
- **Приоритет:** ⭐⭐⭐⭐
- **Сложность:** Низкая

---

### 🟡 Средний приоритет (средние функции, 30-100 строк)

#### 4. `saveUISettings` (~64 строки)

- **Расположение:** `script.js:1271-1334`
- **Размер:** ~64 строки
- **Описание:** Сохранение настроек UI с валидацией и применением
- **Зависимости:**
    - `getSettingsFromModal()` (из `js/ui/ui-settings-modal.js`)
    - `saveUserPreferences()`, `applyPreviewSettings()`
    - `applyPanelOrderAndVisibility()` (из `js/components/tabs.js`)
    - `showNotification()`, `State`
- **Целевой модуль:** `js/ui/ui-settings.js` (расширение)
- **Приоритет:** ⭐⭐⭐⭐
- **Сложность:** Средняя
- **Примечания:** Логически связана с `loadUISettings`

#### 5. `loadUISettings` (~27 строк)

- **Расположение:** `script.js:1243-1269`
- **Размер:** ~27 строк
- **Описание:** Загрузка настроек UI для модального окна
- **Зависимости:**
    - `loadUserPreferences()`, `applyPreviewSettings()`
    - `State`
- **Целевой модуль:** `js/ui/ui-settings.js` (расширение)
- **Приоритет:** ⭐⭐⭐
- **Сложность:** Низкая
- **Примечания:** Логически связана с `saveUISettings`

---

### 🟢 Низкий приоритет (малые функции, <30 строк)

#### 6. `saveCategoryInfo` (~20 строк)

- **Расположение:** `script.js:1177-1196`
- **Размер:** ~20 строк
- **Описание:** Сохранение информации о категориях регламентов
- **Зависимости:**
    - `saveToIndexedDB()`, `populateReglamentCategoryDropdowns()`
    - `showNotification()`, `State`, `categoryDisplayInfo`
- **Целевой модуль:** `js/components/reglaments.js` (расширение)
- **Приоритет:** ⭐⭐⭐
- **Сложность:** Низкая

#### 7. `loadCategoryInfo` (~14 строк)

- **Расположение:** `script.js:1162-1175`
- **Размер:** ~14 строк
- **Описание:** Загрузка информации о категориях регламентов
- **Зависимости:**
    - `getFromIndexedDB()`, `State`, `categoryDisplayInfo`
- **Целевой модуль:** `js/components/reglaments.js` (расширение)
- **Приоритет:** ⭐⭐⭐
- **Сложность:** Низкая

#### 8. `ensureSearchIndexIsBuilt` (~20 строк)

- **Расположение:** `script.js:1141-1160`
- **Размер:** ~20 строк
- **Описание:** Проверка и построение поискового индекса
- **Зависимости:**
    - `checkAndBuildIndex()` (из `js/features/search.js`)
    - `State`
- **Целевой модуль:** `js/features/search.js` (расширение)
- **Приоритет:** ⭐⭐
- **Сложность:** Низкая

#### 9. `_applyThemeClass` (~15 строк)

- **Расположение:** `script.js:2104-2118`
- **Размер:** ~15 строк
- **Описание:** Применение класса темы к документу
- **Зависимости:** DOM API
- **Целевой модуль:** `js/components/theme.js` (расширение)
- **Приоритет:** ⭐⭐
- **Сложность:** Низкая

#### 10. `_onSystemThemeChange` (~3 строки)

- **Расположение:** `script.js:2119-2121`
- **Размер:** ~3 строки
- **Описание:** Обработчик изменения системной темы
- **Зависимости:** `_applyThemeClass()`
- **Целевой модуль:** `js/components/theme.js` (расширение)
- **Приоритет:** ⭐⭐
- **Сложность:** Низкая

---

## 📋 План выполнения по этапам

### Этап 1: Миграция уведомлений (Приоритет: Высокий)

**Цель:** Мигрировать `showNotification` в `js/services/notification.js`

**Шаги:**

1. ✅ Проверить текущий `NotificationService` в `js/services/notification.js`
2. ⬜ Добавить `showNotification` в `NotificationService` или создать отдельную функцию
3. ⬜ Экспортировать функцию из модуля
4. ⬜ Импортировать в `script.js`
5. ⬜ Заменить вызовы в `script.js` на импортированную версию
6. ⬜ Удалить старую функцию из `script.js`
7. ⬜ Обновить зависимости в `script.js`

**Ожидаемый результат:** -207 строк в script.js

---

### Этап 2: Миграция системы данных клиента (Приоритет: Высокий)

**Цель:** Мигрировать `initClientDataSystem` и связанные функции

**Шаги:**

1. ⬜ Найти `createClientNotesInnPreview()` и другие вспомогательные функции
2. ⬜ Создать модуль `js/features/client-data-init.js`
3. ⬜ Мигрировать `initClientDataSystem` в модуль
4. ⬜ Мигрировать `ensureInnPreviewStyles` в модуль
5. ⬜ Мигрировать вспомогательные функции (`getInnAtCursor` и др.)
6. ⬜ Настроить dependency injection для зависимостей
7. ⬜ Экспортировать функции из модуля
8. ⬜ Импортировать в `script.js`
9. ⬜ Заменить вызовы в `script.js`
10. ⬜ Удалить старые функции из `script.js`

**Ожидаемый результат:** -295+ строк в script.js

---

### Этап 3: Миграция настроек UI (Приоритет: Средний)

**Цель:** Мигрировать `loadUISettings` и `saveUISettings` в `js/ui/ui-settings.js`

**Шаги:**

1. ⬜ Открыть `js/ui/ui-settings.js`
2. ⬜ Добавить `loadUISettings` в модуль
3. ⬜ Добавить `saveUISettings` в модуль
4. ⬜ Настроить dependency injection для зависимостей
5. ⬜ Экспортировать функции из модуля
6. ⬜ Импортировать в `script.js`
7. ⬜ Заменить вызовы в `script.js`
8. ⬜ Удалить старые функции из `script.js`

**Ожидаемый результат:** -91 строка в script.js

---

## ✅ Дополнительно завершено (перенос в site/)

- **Миграция логики `window.onload`** в модуль `site/js/app/onload-handler.js`. В `site/script.js` вызываются `setOnloadHandlerDependencies()` и `registerOnloadHandler()`; инициализация PDF-экспорта и ФНС вынесена в `afterInitCallbacks`.
- Обработчики модального окна настроек UI — в `site/js/ui/ui-settings-modal-init.js`.
- Глобальный обработчик клика по оверлею модалок — в `site/js/ui/modal-overlay-handler.js`.
- Управление модальным окном алгоритмов — в `site/js/ui/algorithm-modal-controls.js`.
- Переключение темы и кнопка «Избранное» — в `site/js/ui/theme-toggle.js` и `site/js/ui/header-buttons.js`.
- Инициализация импорта/экспорта — в `site/js/features/import-export.js`.
- Делегированный обработчик кликов по вкладкам — в `site/js/components/tabs.js`.
- HUD фоновой инициализации — в `site/js/ui/background-status-hud.js`.
- Стили `.pdf-dropzone` и `.pdf-empty` из PR11 добавлены в `site/css/styles.css`.
- В **`site/js/app/app-init.js`** в цепочку инициализации и в зависимости добавлены: `initFNSCertificateRevocationSystem`, `initAlgorithmsPdfExportSystem`, `initBackgroundHealthTestsSystem`; в `site/script.js` эти функции передаются в `setAppInitDependencies`.
- В **`site/js/app.js`** в `Bookmarks.setBookmarksDependencies` добавлены из PR11: `showEditBookmarkModal`, `deleteBookmark`, `showBookmarkDetailModal`, `handleViewBookmarkScreenshots`, `NotificationService`, `showScreenshotViewerModal`; в `site/script.js` в оба вызова `setBookmarksDependencies` добавлены `NotificationService` и `showScreenshotViewerModal`.
- В **`site/js/components/tabs.js`** добавлена функция **`initTabClickDelegation()`** и её вызов в `site/js/app/onload-handler.js` (в том же `requestAnimationFrame`, что и `setupTabsOverflow`).
- В **`site/js/config.js`** название вкладки ФНС приведено к PR11: «Проверка сертификата ФНС».

---

### Этап 4: Миграция функций категорий (Приоритет: Средний)

**Цель:** Мигрировать `loadCategoryInfo` и `saveCategoryInfo` в `js/components/reglaments.js`

**Шаги:**

1. ⬜ Открыть `js/components/reglaments.js`
2. ⬜ Добавить `loadCategoryInfo` в модуль
3. ⬜ Добавить `saveCategoryInfo` в модуль
4. ⬜ Настроить dependency injection для зависимостей
5. ⬜ Экспортировать функции из модуля
6. ⬜ Импортировать в `script.js`
7. ⬜ Заменить вызовы в `script.js`
8. ⬜ Удалить старые функции из `script.js`

**Ожидаемый результат:** -34 строки в script.js

---

### Этап 5: Миграция функций темы (Приоритет: Низкий)

**Цель:** Мигрировать `_applyThemeClass` и `_onSystemThemeChange` в `js/components/theme.js`

**Шаги:**

1. ⬜ Открыть `js/components/theme.js`
2. ⬜ Добавить `_applyThemeClass` в модуль (переименовать в `applyThemeClass`)
3. ⬜ Добавить `_onSystemThemeChange` в модуль (переименовать в `onSystemThemeChange`)
4. ⬜ Экспортировать функции из модуля
5. ⬜ Импортировать в `script.js`
6. ⬜ Заменить вызовы в `script.js`
7. ⬜ Удалить старые функции из `script.js`

**Ожидаемый результат:** -18 строк в script.js

---

### Этап 6: Миграция функции поиска (Приоритет: Низкий)

**Цель:** Мигрировать `ensureSearchIndexIsBuilt` в `js/features/search.js`

**Шаги:**

1. ⬜ Открыть `js/features/search.js`
2. ⬜ Добавить `ensureSearchIndexIsBuilt` в модуль
3. ⬜ Настроить dependency injection для зависимостей
4. ⬜ Экспортировать функцию из модуля
5. ⬜ Импортировать в `script.js`
6. ⬜ Заменить вызовы в `script.js`
7. ⬜ Удалить старую функцию из `script.js`

**Ожидаемый результат:** -20 строк в script.js

---

## 📈 Ожидаемые результаты

### После завершения всех этапов:

- **Удалено из script.js:** ~665+ строк
- **Создано в модулях:** ~700+ строк (с учетом dependency injection)
- **Новый размер script.js:** ~3,383 строки
- **Прогресс миграции:** ~75-80%

### Дополнительные возможности:

После завершения основных этапов можно продолжить миграцию:

- Event listeners и инициализация (~2,400 строк)
- Мелкие вспомогательные функции
- Оставшиеся обертки (wrappers)

---

## 🔍 Дополнительные функции для анализа

Следующие функции требуют дополнительного анализа для определения необходимости миграции:

1. `showOverlayForFixedDuration` (~5 строк) - возможно, стоит оставить в script.js
2. `ensureNotificationIconlessStyles` (~3 строки) - заглушка, можно удалить
3. Вспомогательные функции внутри `initClientDataSystem`:
    - `getInnAtCursor` - нужно найти и проанализировать
    - `createClientNotesInnPreview` - нужно найти и проанализировать
    - `__acquireCopyLock` - нужно найти и проанализировать

---

## ✅ Критерии успешной миграции

Для каждой мигрированной функции:

1. ✅ Функция работает идентично оригиналу
2. ✅ Все зависимости правильно инжектированы
3. ✅ Функция экспортируется из модуля
4. ✅ Функция импортируется в script.js
5. ✅ Старая функция удалена из script.js
6. ✅ Нет дублирования кода
7. ✅ Линтер не находит ошибок
8. ✅ Приложение работает без ошибок

---

## 📝 Примечания

- **Dependency Injection:** Большинство функций требуют настройки dependency injection через функции `set*Dependencies()`
- **Обратная совместимость:** Некоторые функции могут использоваться глобально, нужно проверить все места использования
- **Тестирование:** После каждой миграции необходимо тестировать функциональность
- **Коммиты:** Рекомендуется делать отдельный коммит для каждого этапа миграции

---

**Последнее обновление:** 6 февраля 2026  
**Статус:** Активный план миграции
