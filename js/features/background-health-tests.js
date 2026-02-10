'use strict';

let deps = {};

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

    const start = async () => {
        await waitUntilAppAvailable(12000);
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
                    if (!deps.saveToIndexedDB || !deps.getFromIndexedDB || !deps.deleteFromIndexedDB) {
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
                    } catch (_) {}
                }
                updateHud(40);

                // Тест 3: состояние поискового индекса
                try {
                    if (!deps.performDBOperation) {
                        throw new Error('Метод performDBOperation не доступен.');
                    }
                    const count = await runWithTimeout(
                        deps.performDBOperation('searchIndex', 'readonly', (store) => {
                            return new Promise((resolve, reject) => {
                                const req = store.count();
                                req.onsuccess = () => resolve(req.result || 0);
                                req.onerror = () => reject(req.error || new Error('Ошибка подсчета'));
                            });
                        }),
                        5000,
                    );
                    if (!count) {
                        report(
                            'warn',
                            'Поисковый индекс',
                            'Индекс пуст или не заполнен.',
                        );
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
                        report(
                            'warn',
                            'Алгоритмы',
                            'Основной алгоритм не найден в базе данных.',
                        );
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
                        deps.performDBOperation?.('blacklistedClients', 'readonly', (store) => {
                            return new Promise((resolve, reject) => {
                                const req = store.count();
                                req.onsuccess = () => resolve(req.result || 0);
                                req.onerror = () => reject(req.error || new Error('Ошибка подсчета'));
                            });
                        }),
                        5000,
                    );
                    report('info', 'Черный список', `Записей в списке: ${blacklistCount}.`);
                } catch (err) {
                    report('warn', 'Черный список', err.message);
                }
                // Тест 6: надежность UI настроек
                try {
                    const uiSettings = await runWithTimeout(
                        deps.getFromIndexedDB?.('preferences', 'uiSettings'),
                        5000,
                    );
                    if (!uiSettings) {
                        report('warn', 'UI настройки', 'Сохраненные uiSettings отсутствуют, используются дефолты.');
                    } else {
                        const hasOrder = Array.isArray(uiSettings.panelOrder) && uiSettings.panelOrder.length > 0;
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
                            report('info', 'UI настройки', 'Структура сохраненных UI настроек корректна.');
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
            }
        })();
    };

    setTimeout(() => {
        start();
    }, 1500);
}

window.initBackgroundHealthTestsSystem = initBackgroundHealthTestsSystem;
