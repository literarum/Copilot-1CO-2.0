'use strict';

import { REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER } from '../config/revocation-sources.js';

let deps = {};
const WATCHDOG_INTERVAL_MS = 60000;
const AUTOSAVE_STALE_MS = 45000;
const REQUIRED_STORES = [
    'algorithms',
    'clientData',
    'searchIndex',
    'preferences',
    'blacklistedClients',
];

export function setBackgroundHealthTestsDependencies(nextDeps) {
    deps = { ...nextDeps };
}

function nowLabel() {
    return new Date().toLocaleString('ru-RU');
}

function runWithTimeout(promise, ms) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Превышено время ожидания')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function waitUntilAppAvailable(timeoutMs = 10000) {
    return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
            const appContent = document.getElementById('appContent');
            const isVisible = appContent && !appContent.classList.contains('hidden');
            if (isVisible || Date.now() - started > timeoutMs) {
                resolve();
                return;
            }
            requestAnimationFrame(tick);
        };
        tick();
    });
}

export function initBackgroundHealthTestsSystem() {
    if (initBackgroundHealthTestsSystem._started) return;
    initBackgroundHealthTestsSystem._started = true;

    const hud = window.BackgroundStatusHUD;
    const taskId = 'background-tests';
    const results = {
        errors: [],
        warnings: [],
        checks: [],
    };

    const report = (level, title, message) => {
        const entry = { title, message };
        if (level === 'error') results.errors.push(entry);
        if (level === 'warn') results.warnings.push(entry);
        results.checks.push(entry);
    };

    const updateHud = (progress) => {
        if (hud?.updateTask) hud.updateTask(taskId, progress, 100);
    };

    const finishHud = (success) => {
        if (hud?.finishTask) hud.finishTask(taskId, success);
        if (hud?.setDiagnostics) {
            hud.setDiagnostics({
                errors: results.errors,
                warnings: results.warnings,
                checks: results.checks,
                updatedAt: nowLabel(),
            });
        }
    };

    const autosaveState = {
        lastText: null,
        changedAt: 0,
        lastPersistedAt: 0,
    };
    let watchdogInFlight = null;

    const setWatchdogHudStatus = (patch = {}) => {
        hud?.setWatchdogStatus?.({
            statusText: patch.statusText || 'Работает',
            lastRunAt: patch.lastRunAt || Date.now(),
            lastAutosaveAt:
                patch.lastAutosaveAt !== undefined
                    ? patch.lastAutosaveAt
                    : autosaveState.lastPersistedAt || null,
            running: Boolean(patch.running),
            severity: patch.severity || 'running',
        });
    };

    const readPersistedClientData = async () => {
        if (deps.getFromIndexedDB) {
            try {
                const fromDb = await runWithTimeout(
                    deps.getFromIndexedDB('clientData', 'current'),
                    5000,
                );
                if (fromDb && typeof fromDb === 'object') {
                    return fromDb;
                }
            } catch {
                // fallback to localStorage below
            }
        }

        try {
            const raw = localStorage.getItem('clientData');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const runWatchdogCycle = async (source = 'interval') => {
        if (watchdogInFlight) return watchdogInFlight;
        setWatchdogHudStatus({
            statusText: source === 'manual' ? 'Ручной прогон...' : 'Плановая проверка...',
            running: true,
            severity: 'running',
        });

        watchdogInFlight = (async () => {
            const cycleChecks = [];
            const addCheck = (level, title, message) => {
                cycleChecks.push({ level, title, message });
            };

            // Watchdog 1: целостность структуры IndexedDB
            try {
                const db = deps.State?.db;
                if (!db) {
                    addCheck(
                        'warn',
                        'Watchdog / IndexedDB',
                        'Соединение с IndexedDB не инициализировано.',
                    );
                } else {
                    const availableStores = Array.from(db.objectStoreNames || []);
                    const missingStores = REQUIRED_STORES.filter(
                        (store) => !availableStores.includes(store),
                    );
                    if (missingStores.length > 0) {
                        addCheck(
                            'error',
                            'Watchdog / IndexedDB',
                            `Отсутствуют хранилища: ${missingStores.join(', ')}.`,
                        );
                    } else {
                        addCheck(
                            'info',
                            'Watchdog / IndexedDB',
                            'Все ключевые хранилища присутствуют.',
                        );
                    }

                    if (deps.performDBOperation) {
                        const counters = await Promise.allSettled([
                            runWithTimeout(
                                deps.performDBOperation('algorithms', 'readonly', (store) =>
                                    store.count(),
                                ),
                                5000,
                            ),
                            runWithTimeout(
                                deps.performDBOperation('clientData', 'readonly', (store) =>
                                    store.count(),
                                ),
                                5000,
                            ),
                        ]);

                        const hasCounterError = counters.some(
                            (entry) => entry.status === 'rejected',
                        );
                        if (hasCounterError) {
                            addCheck(
                                'warn',
                                'Watchdog / IndexedDB',
                                'Одна из read-проверок не выполнена (count).',
                            );
                        }
                    }
                }
            } catch (err) {
                addCheck('error', 'Watchdog / IndexedDB', err.message);
            }

            // Watchdog 2: здоровье автосохранения notes
            try {
                const clientNotes = document.getElementById('clientNotes');
                if (!clientNotes) {
                    addCheck(
                        'warn',
                        'Watchdog / Автосохранение',
                        'Поле #clientNotes не найдено (проверка пропущена).',
                    );
                } else {
                    const currentText = clientNotes.value ?? '';
                    if (autosaveState.lastText === null) {
                        autosaveState.lastText = currentText;
                        autosaveState.changedAt = Date.now();
                    } else if (currentText !== autosaveState.lastText) {
                        autosaveState.lastText = currentText;
                        autosaveState.changedAt = Date.now();
                    }

                    if (!deps.State?.clientNotesInputHandler) {
                        addCheck(
                            'error',
                            'Watchdog / Автосохранение',
                            'Обработчик input для #clientNotes не привязан.',
                        );
                    }

                    const persisted = await readPersistedClientData();
                    const persistedText = persisted?.notes ?? '';
                    const sameAsPersisted = persistedText === currentText;
                    if (sameAsPersisted) {
                        autosaveState.lastPersistedAt = Date.now();
                        addCheck(
                            'info',
                            'Watchdog / Автосохранение',
                            'Сохранённые данные синхронизированы.',
                        );
                    } else {
                        const elapsed = Date.now() - autosaveState.changedAt;
                        if (elapsed > AUTOSAVE_STALE_MS) {
                            addCheck(
                                'warn',
                                'Watchdog / Автосохранение',
                                `Несохранённые изменения дольше ${Math.round(
                                    AUTOSAVE_STALE_MS / 1000,
                                )}с.`,
                            );
                        } else {
                            addCheck(
                                'info',
                                'Watchdog / Автосохранение',
                                'Обнаружены несохранённые изменения, ожидается автосохранение.',
                            );
                        }
                    }
                }
            } catch (err) {
                addCheck('error', 'Watchdog / Автосохранение', err.message);
            }

            // Обновляем диагностику, добавляя watchdog-результаты к уже собранным.
            if (hud?.setDiagnostics) {
                const mergedChecks = [
                    ...results.checks.filter((entry) => !entry.title.startsWith('Watchdog / ')),
                    ...cycleChecks.map(({ title, message }) => ({ title, message })),
                ];
                const mergedErrors = [
                    ...results.errors.filter((entry) => !entry.title.startsWith('Watchdog / ')),
                    ...cycleChecks
                        .filter((entry) => entry.level === 'error')
                        .map(({ title, message }) => ({ title, message })),
                ];
                const mergedWarnings = [
                    ...results.warnings.filter((entry) => !entry.title.startsWith('Watchdog / ')),
                    ...cycleChecks
                        .filter((entry) => entry.level === 'warn')
                        .map(({ title, message }) => ({ title, message })),
                ];

                hud.setDiagnostics({
                    errors: mergedErrors,
                    warnings: mergedWarnings,
                    checks: mergedChecks,
                    updatedAt: nowLabel(),
                });
            }
            const hasErrors = cycleChecks.some((entry) => entry.level === 'error');
            const hasWarnings = cycleChecks.some((entry) => entry.level === 'warn');
            setWatchdogHudStatus({
                statusText: hasErrors
                    ? 'Проблемы обнаружены'
                    : hasWarnings
                      ? 'Есть предупреждения'
                      : 'Система в норме',
                running: false,
                lastRunAt: Date.now(),
                lastAutosaveAt: autosaveState.lastPersistedAt || null,
                severity: hasErrors ? 'error' : hasWarnings ? 'warn' : 'ok',
            });
        })()
            .catch((err) => {
                setWatchdogHudStatus({
                    statusText: `Ошибка watchdog: ${err.message}`,
                    running: false,
                    lastRunAt: Date.now(),
                    lastAutosaveAt: autosaveState.lastPersistedAt || null,
                    severity: 'error',
                });
                throw err;
            })
            .finally(() => {
                watchdogInFlight = null;
            });

        return watchdogInFlight;
    };

    const start = async () => {
        await waitUntilAppAvailable(12000);
        hud?.setWatchdogRunNowHandler?.(() => {
            runWatchdogCycle('manual').catch((err) => {
                console.error('[BackgroundHealthTests] Ошибка ручного watchdog-цикла:', err);
            });
        });
        setWatchdogHudStatus({
            statusText: 'Ожидание первого цикла',
            running: false,
            lastRunAt: null,
            lastAutosaveAt: null,
            severity: 'running',
        });
        hud?.startTask?.(taskId, 'Фоновая диагностика', { weight: 0.4, total: 100 });
        updateHud(5);

        (async () => {
            try {
                // Тест 1: localStorage доступен
                try {
                    const key = 'health-check';
                    localStorage.setItem(key, 'ok');
                    const value = localStorage.getItem(key);
                    if (value !== 'ok') {
                        report('warn', 'localStorage', 'Не удалось проверить запись/чтение.');
                    } else {
                        report('info', 'localStorage', 'Запись и чтение доступны.');
                    }
                    localStorage.removeItem(key);
                } catch (err) {
                    report('error', 'localStorage', err.message);
                }
                updateHud(20);

                // Тест 2: запись/чтение IndexedDB
                const testId = `health-${Date.now()}`;
                try {
                    if (
                        !deps.saveToIndexedDB ||
                        !deps.getFromIndexedDB ||
                        !deps.deleteFromIndexedDB
                    ) {
                        throw new Error('Отсутствуют методы работы с IndexedDB.');
                    }
                    await runWithTimeout(
                        deps.saveToIndexedDB('clientData', { id: testId, notes: 'health-check' }),
                        5000,
                    );
                    const record = await runWithTimeout(
                        deps.getFromIndexedDB('clientData', testId),
                        5000,
                    );
                    if (!record) {
                        report('error', 'IndexedDB', 'Запись не найдена после сохранения.');
                    } else {
                        report('info', 'IndexedDB', 'Запись и чтение работают.');
                    }
                } catch (err) {
                    report('error', 'IndexedDB', err.message);
                } finally {
                    try {
                        await deps.deleteFromIndexedDB?.('clientData', testId);
                    } catch {
                        // cleanup failure should not fail health check sequence
                    }
                }
                updateHud(40);

                // Тест 3: состояние поискового индекса
                try {
                    if (!deps.performDBOperation) {
                        throw new Error('Метод performDBOperation не доступен.');
                    }
                    const count = await runWithTimeout(
                        deps.performDBOperation('searchIndex', 'readonly', (store) =>
                            store.count(),
                        ),
                        5000,
                    );
                    if (!count) {
                        report('warn', 'Поисковый индекс', 'Индекс пуст или не заполнен.');
                    } else {
                        report('info', 'Поисковый индекс', `Записей в индексе: ${count}.`);
                    }
                } catch (err) {
                    report('error', 'Поисковый индекс', err.message);
                }
                updateHud(60);

                // Тест 4: доступность базы алгоритмов
                try {
                    const mainAlgo = await runWithTimeout(
                        deps.getFromIndexedDB?.('algorithms', 'main'),
                        5000,
                    );
                    if (!mainAlgo) {
                        report('warn', 'Алгоритмы', 'Основной алгоритм не найден в базе данных.');
                    } else {
                        report('info', 'Алгоритмы', 'База алгоритмов доступна.');
                    }
                } catch (err) {
                    report('error', 'Алгоритмы', err.message);
                }
                updateHud(80);

                // Тест 5: целостность списка жаб
                try {
                    const blacklistCount = await runWithTimeout(
                        deps.performDBOperation?.('blacklistedClients', 'readonly', (store) =>
                            store.count(),
                        ),
                        5000,
                    );
                    report('info', 'Черный список', `Записей в списке: ${blacklistCount}.`);
                } catch (err) {
                    report('warn', 'Черный список', err.message);
                }
                // Тест 5.5: компонента проверки отзыва (CRL Helper)
                if (REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
                    try {
                        const avail = window.__revocationHelperAvailable;
                        if (avail === true) {
                            report(
                                'info',
                                'Компонента проверки отзыва',
                                'Локальная компонента доступна.',
                            );
                        } else if (avail === false) {
                            report(
                                'info',
                                'Компонента проверки отзыва',
                                'Компонента не запущена. Нажмите «Установить» в разделе проверки сертификата.',
                            );
                        } else {
                            report('info', 'Компонента проверки отзыва', 'Проверка в процессе.');
                        }
                    } catch (err) {
                        report('warn', 'Компонента проверки отзыва', err.message);
                    }
                }

                // Тест 6: надежность UI настроек
                try {
                    const uiSettings = await runWithTimeout(
                        deps.getFromIndexedDB?.('preferences', 'uiSettings'),
                        5000,
                    );
                    if (!uiSettings) {
                        report(
                            'warn',
                            'UI настройки',
                            'Сохраненные uiSettings отсутствуют, используются дефолты.',
                        );
                    } else {
                        const hasOrder =
                            Array.isArray(uiSettings.panelOrder) &&
                            uiSettings.panelOrder.length > 0;
                        const hasVisibility =
                            Array.isArray(uiSettings.panelVisibility) &&
                            uiSettings.panelVisibility.length === uiSettings.panelOrder?.length;
                        if (!hasOrder || !hasVisibility) {
                            report(
                                'warn',
                                'UI настройки',
                                'Неконсистентный формат panelOrder/panelVisibility в uiSettings.',
                            );
                        } else {
                            report(
                                'info',
                                'UI настройки',
                                'Структура сохраненных UI настроек корректна.',
                            );
                        }
                    }
                } catch (err) {
                    report('warn', 'UI настройки', err.message);
                }

                updateHud(95);
            } catch (err) {
                report('error', 'Фоновая диагностика', err.message);
            } finally {
                updateHud(100);
                finishHud(results.errors.length === 0);

                // После стартовой диагностики запускаем постоянный watchdog.
                runWatchdogCycle('startup').catch((err) => {
                    console.error('[BackgroundHealthTests] Ошибка watchdog-цикла:', err);
                });
                initBackgroundHealthTestsSystem._watchdogIntervalId = setInterval(() => {
                    runWatchdogCycle('interval').catch((err) => {
                        console.error('[BackgroundHealthTests] Ошибка watchdog-цикла:', err);
                    });
                }, WATCHDOG_INTERVAL_MS);
            }
        })();
    };

    setTimeout(() => {
        start();
    }, 1500);
}

window.initBackgroundHealthTestsSystem = initBackgroundHealthTestsSystem;
