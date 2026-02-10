'use strict';

/**
 * Модуль управления данными клиента
 * Содержит функции для сохранения, загрузки, экспорта и очистки данных клиента
 */

import { State } from '../app/state.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import { DEFAULT_WELCOME_CLIENT_NOTES_TEXT } from '../constants.js';
import { normalizeAlgorithmSteps } from '../components/algorithms.js';
import { deepEqual } from '../utils/helpers.js';

let deps = {
    showNotification: null,
    NotificationService: null,
    updateSearchIndex: null,
    debounce: null,
    checkForBlacklistedInn: null,
    copyToClipboard: null,
    getVisibleModals: null,
    escapeHtml: null,
    DEFAULT_MAIN_ALGORITHM: null,
    algorithms: null,
    saveUserPreferences: null,
};

/**
 * Устанавливает зависимости модуля
 */
export function setClientDataDependencies(dependencies) {
    if (dependencies.showNotification) deps.showNotification = dependencies.showNotification;
    if (dependencies.NotificationService) deps.NotificationService = dependencies.NotificationService;
    if (dependencies.updateSearchIndex) deps.updateSearchIndex = dependencies.updateSearchIndex;
    if (dependencies.debounce) deps.debounce = dependencies.debounce;
    if (dependencies.checkForBlacklistedInn) deps.checkForBlacklistedInn = dependencies.checkForBlacklistedInn;
    if (dependencies.copyToClipboard) deps.copyToClipboard = dependencies.copyToClipboard;
    if (dependencies.getVisibleModals) deps.getVisibleModals = dependencies.getVisibleModals;
    if (dependencies.escapeHtml) deps.escapeHtml = dependencies.escapeHtml;
    if (dependencies.DEFAULT_MAIN_ALGORITHM)
        deps.DEFAULT_MAIN_ALGORITHM = dependencies.DEFAULT_MAIN_ALGORITHM;
    if (dependencies.algorithms) deps.algorithms = dependencies.algorithms;
    if (dependencies.saveUserPreferences) deps.saveUserPreferences = dependencies.saveUserPreferences;
    console.log('[client-data.js] Зависимости установлены');
}

/**
 * Получает данные клиента из DOM
 * @returns {Object} объект с данными клиента
 */
export function getClientData() {
    const notesValue = document.getElementById('clientNotes')?.value ?? '';
    return {
        id: 'current',
        notes: notesValue,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Сохраняет данные клиента в IndexedDB или localStorage
 */
export async function saveClientData() {
    const clientDataToSave = getClientData();
    let oldData = null;
    let savedToDB = false;

    if (State.db) {
        try {
            oldData = await getFromIndexedDB('clientData', clientDataToSave.id);
            await saveToIndexedDB('clientData', clientDataToSave);
            console.log('Client data saved to IndexedDB');
            savedToDB = true;

            if (deps.updateSearchIndex && typeof deps.updateSearchIndex === 'function') {
                await deps.updateSearchIndex(
                    'clientData',
                    clientDataToSave.id,
                    clientDataToSave,
                    'update',
                    oldData,
                );
                console.log(
                    `Обновление индекса для clientData (${clientDataToSave.id}) инициировано.`,
                );
            }
        } catch (error) {
            console.error('Ошибка сохранения данных клиента в IndexedDB:', error);
            if (deps.showNotification) {
                deps.showNotification('Ошибка сохранения данных клиента', 'error');
            }
        }
    }

    if (!savedToDB) {
        try {
            localStorage.setItem('clientData', JSON.stringify(clientDataToSave));
            console.warn(
                'Данные клиента сохранены в localStorage (БД недоступна или ошибка сохранения в БД).',
            );

            if (State.db && deps.showNotification) {
                deps.showNotification(
                    'Данные клиента сохранены локально (резервное хранилище), но не в базу данных.',
                    'warning',
                );
            }
        } catch (lsError) {
            console.error(
                'Критическая ошибка: Не удалось сохранить данные клиента ни в БД, ни в localStorage!',
                lsError,
            );
            if (deps.showNotification) {
                deps.showNotification('Критическая ошибка: Не удалось сохранить данные клиента.', 'error');
            }
        }
    }
}

/**
 * Экспортирует данные клиента в TXT файл
 */
export async function exportClientDataToTxt() {
    const notes = document.getElementById('clientNotes')?.value ?? '';
    if (!notes.trim()) {
        if (deps.showNotification) {
            deps.showNotification('Нет данных для сохранения', 'error');
        }
        return;
    }

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const filename = `Обращение_1С_${timestamp}.txt`;
    const blob = new Blob([notes], { type: 'text/plain;charset=utf-8' });

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [
                    {
                        description: 'Текстовые файлы',
                        accept: { 'text/plain': ['.txt'] },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            if (deps.showNotification) {
                deps.showNotification('Файл успешно сохранен');
            }
            console.log('Экспорт текста клиента через File System Access API завершен успешно.');
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Сохранение файла отменено пользователем.');
                if (deps.showNotification) {
                    deps.showNotification('Сохранение файла отменено', 'info');
                }
            } else {
                console.error(
                    'Ошибка сохранения через File System Access API, используем fallback:',
                    err,
                );
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                if (deps.showNotification) {
                    deps.showNotification('Файл успешно сохранен (fallback)');
                }
                console.log('Экспорт текста клиента через data URI (fallback) завершен успешно.');
            }
        }
    } else {
        console.log('File System Access API не поддерживается, используем fallback.');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        if (deps.showNotification) {
            deps.showNotification('Файл успешно сохранен');
        }
        console.log('Экспорт текста клиента через data URI завершен успешно.');
    }
}

/**
 * Загружает данные клиента в DOM
 * @param {Object} data - объект с данными клиента
 */
export function loadClientData(data) {
    if (!data) return;
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes) {
        clientNotes.value = data.notes ?? '';
    }
}

/**
 * Очищает данные клиента
 */
export function clearClientData() {
    const LOG_PREFIX = '[ClearClientData V2]';
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes) {
        clientNotes.value = '';
        saveClientData();
        if (deps.showNotification) {
            deps.showNotification('Данные очищены');
        }

        console.log(`${LOG_PREFIX} Очистка состояний черного списка...`);

        if (deps.NotificationService && State.activeToadNotifications) {
            for (const notificationId of State.activeToadNotifications.values()) {
                deps.NotificationService.dismissImportant(notificationId);
            }
        }

        if (State.lastKnownInnCounts) {
            State.lastKnownInnCounts.clear();
        }
        if (State.activeToadNotifications) {
            State.activeToadNotifications.clear();
        }

        console.log(
            `${LOG_PREFIX} Состояния 'State.lastKnownInnCounts' и 'State.activeToadNotifications' очищены.`,
        );
    }
}

/**
 * Применяет размер шрифта для поля заметок клиента
 */
export function applyClientNotesFontSize() {
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes && State.userPreferences && typeof State.userPreferences.clientNotesFontSize === 'number') {
        const fontSize = State.userPreferences.clientNotesFontSize;
        clientNotes.style.fontSize = `${fontSize}%`;
        console.log(`[applyClientNotesFontSize] Font size for client notes set to ${fontSize}%.`);
    } else {
        if (!clientNotes)
            console.warn(
                '[applyClientNotesFontSize] Could not apply font size: #clientNotes element not found.',
            );
        if (!State.userPreferences || typeof State.userPreferences.clientNotesFontSize !== 'number') {
            console.warn(
                '[applyClientNotesFontSize] Could not apply font size: State.userPreferences.clientNotesFontSize is missing or invalid.',
            );
        }
    }
}

/**
 * Добавляет стили для превью ИНН в поле заметок
 */
export function ensureInnPreviewStyles() {
    if (document.getElementById('innPreviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'innPreviewStyles';
    style.textContent = `
    .client-notes-preview{
        position: absolute;
        --inn-offset-x: -0.4px;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
        scrollbar-width: none;
        -ms-overflow-style: none;
        background: transparent;
        pointer-events: none;
        z-index: 2;
    }
    .client-notes-preview::-webkit-scrollbar{
        width: 0; height: 0; display: none;
    }
        .client-notes-preview__inner{
        position: relative;
        will-change: transform;
    }
    .client-notes-preview .inn-highlight{
        color: var(--color-primary, #7aa2ff) !important;
        text-decoration: underline;
        text-decoration-color: var(--color-primary);
        text-decoration-thickness: .1em;
        text-underline-offset: .12em;
        text-decoration-skip-ink: auto;
        /* НИЧЕГО, что меняет метрики инлайна */
        display: inline;
        padding: 0;
        margin: 0;
    }
 
  `;
    document.head.appendChild(style);
}

/**
 * Создает превью ИНН в поле заметок клиента
 * @param {HTMLTextAreaElement} textarea - элемент textarea
 * @returns {Object} объект с методами управления превью
 */
export function createClientNotesInnPreview(textarea) {
    const escapeHtml = deps.escapeHtml;
    const getVisibleModals = deps.getVisibleModals;
    const wrapper = textarea.parentElement;
    try {
        const ws = getComputedStyle(wrapper);
        if (ws.position === 'static') wrapper.style.position = 'relative';
    } catch (_) {}

    const preview = document.createElement('div');
    preview.className = 'client-notes-preview';
    preview.style.display = 'none';
    const inner = document.createElement('div');
    inner.className = 'client-notes-preview__inner';
    preview.appendChild(inner);
    wrapper.appendChild(preview);

    const posOverlay = () => {
        const tr = textarea.getBoundingClientRect();
        const wr = wrapper.getBoundingClientRect();
        const left = tr.left - wr.left + wrapper.scrollLeft;
        const top = tr.top - wr.top + wrapper.scrollTop;
        preview.style.left = `${left}px`;
        preview.style.top = `${top}px`;
        preview.style.width = `${textarea.clientWidth}px`;
        preview.style.height = `${textarea.clientHeight}px`;
    };

    const getOffsetX = () => {
        const v = getComputedStyle(preview).getPropertyValue('--inn-offset-x').trim();
        return v ? parseFloat(v) : 0;
    };

    const computeUsedLineHeightPx = () => {
        const cs = getComputedStyle(textarea);
        if (cs.lineHeight && cs.lineHeight !== 'normal') return cs.lineHeight;
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.whiteSpace = 'pre-wrap';
        probe.style.font =
            cs.font ||
            `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
        probe.style.letterSpacing = cs.letterSpacing;
        probe.textContent = 'A\nA';
        document.body.appendChild(probe);
        const h = probe.getBoundingClientRect().height / 2;
        document.body.removeChild(probe);
        return `${h}px`;
    };

    const syncMetrics = () => {
        const cs = getComputedStyle(textarea);
        preview.style.font = cs.font;
        preview.style.lineHeight = computeUsedLineHeightPx();
        preview.style.lineHeight = cs.lineHeight;
        preview.style.letterSpacing = cs.letterSpacing;
        preview.style.textAlign = cs.textAlign;
        preview.style.borderRadius = cs.borderRadius;
        preview.style.boxSizing = cs.boxSizing;
        preview.style.color = 'transparent';
        preview.style.paddingTop = cs.paddingTop;
        preview.style.paddingRight = cs.paddingRight;
        preview.style.paddingBottom = cs.paddingBottom;
        preview.style.paddingLeft = cs.paddingLeft;
        posOverlay();
    };

    const ensureBodyScrollUnlocked = () => {
        try {
            const hasVisibleModals =
                typeof getVisibleModals === 'function' && getVisibleModals().length > 0;
            if (!hasVisibleModals) {
                document.body.classList.remove('modal-open', 'overflow-hidden');
                if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
                if (document.documentElement.style.overflow === 'hidden')
                    document.documentElement.style.overflow = '';
            }
        } catch (_) {}
    };

    const update = () => {
        const text = textarea.value || '';
        const escaped =
            typeof escapeHtml === 'function'
                ? escapeHtml(text)
                : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const rx = /(^|\D)(\d{10}|\d{12})(?!\d)/g;
        inner.innerHTML = escaped.replace(rx, '$1<span class="inn-highlight">$2</span>');
        inner.style.transform = `translate(${getOffsetX()}px, ${-textarea.scrollTop}px)`;
        posOverlay();
    };

    const onScroll = () => {
        inner.style.transform = `translate(${getOffsetX()}px, ${-textarea.scrollTop}px)`;
    };
    textarea.addEventListener('scroll', onScroll);
    window.addEventListener('resize', () => {
        syncMetrics();
    });
    syncMetrics();

    return {
        show() {
            textarea.style.cursor = 'pointer';
            preview.style.display = '';
            syncMetrics();
            ensureBodyScrollUnlocked();
        },
        hide() {
            textarea.style.cursor = '';
            preview.style.display = 'none';
            ensureBodyScrollUnlocked();
        },
        update,
        destroy() {
            textarea.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', syncMetrics);
            preview.remove();
        },
    };
}

/**
 * Инициализирует систему данных клиента
 */
export async function initClientDataSystem() {
    ensureInnPreviewStyles();
    const LOG_PREFIX = '[ClientDataSystem]';
    console.log(`${LOG_PREFIX} Запуск инициализации...`);

    const debounceFn =
        typeof deps.debounce === 'function'
            ? deps.debounce
            : (fn) => {
                  console.warn('[ClientDataSystem] debounce не задан, используется прямой вызов.');
                  return fn;
              };

    const clientNotes = document.getElementById('clientNotes');
    if (!clientNotes) {
        console.error(
            `${LOG_PREFIX} КРИТИЧЕСКАЯ ОШИБКА: поле для заметок #clientNotes не найдено. Система не будет работать.`,
        );
        return;
    }
    console.log(`${LOG_PREFIX} Поле #clientNotes успешно найдено.`);

    const clearClientDataBtn = document.getElementById('clearClientDataBtn');
    if (!clearClientDataBtn) {
        console.warn(`${LOG_PREFIX} Кнопка #clearClientDataBtn не найдена.`);
    }

    const buttonContainer = clearClientDataBtn?.parentNode;
    if (!buttonContainer) {
        console.warn(
            `${LOG_PREFIX} Родительский контейнер для кнопок управления данными клиента не найден.`,
        );
    }

    if (State.clientNotesInputHandler) {
        clientNotes.removeEventListener('input', State.clientNotesInputHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'input' удален.`);
    }
    if (State.clientNotesKeydownHandler) {
        clientNotes.removeEventListener('keydown', State.clientNotesKeydownHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keydown' удален.`);
    }

    if (State.clientNotesCtrlClickHandler) {
        clientNotes.removeEventListener('mousedown', State.clientNotesCtrlClickHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'click' (Ctrl+Click INN) удален.`);
    }
    if (State.clientNotesBlurHandler) {
        clientNotes.removeEventListener('blur', State.clientNotesBlurHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'blur' (сброс курсора) удален.`);
    }
    if (State.clientNotesCtrlKeyDownHandler) {
        document.removeEventListener('keydown', State.clientNotesCtrlKeyDownHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keydown' (Ctrl cursor) удален.`);
    }
    if (State.clientNotesCtrlKeyUpHandler) {
        document.removeEventListener('keyup', State.clientNotesCtrlKeyUpHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keyup' (Ctrl cursor) удален.`);
    }

    if (window.__clientNotesInnPreviewInputHandler) {
        clientNotes.removeEventListener('input', window.__clientNotesInnPreviewInputHandler);
        window.__clientNotesInnPreviewInputHandler = null;
        console.log(`${LOG_PREFIX} Старый обработчик 'input' (ИНН-превью) удален.`);
    }
    if (
        window.__clientNotesInnPreview &&
        typeof window.__clientNotesInnPreview.destroy === 'function'
    ) {
        window.__clientNotesInnPreview.destroy();
        window.__clientNotesInnPreview = null;
        console.log(`${LOG_PREFIX} Старое ИНН-превью уничтожено.`);
    }

    State.clientNotesInputHandler = debounceFn(async () => {
        try {
            console.log(`${LOG_PREFIX} Debounce-таймер сработал. Выполняем действия...`);
            const currentText = clientNotes.value;

            console.log(`${LOG_PREFIX}   -> Вызов await saveClientData()`);
            await saveClientData();

            if (typeof deps.checkForBlacklistedInn === 'function') {
                console.log(`${LOG_PREFIX}   -> Вызов await checkForBlacklistedInn()`);
                await deps.checkForBlacklistedInn(currentText);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} Ошибка внутри debounced-обработчика:`, error);
        }
    }, 750);

    clientNotes.addEventListener('input', State.clientNotesInputHandler);
    console.log(`${LOG_PREFIX} Новый обработчик 'input' с debounce и await успешно привязан.`);

    State.clientNotesKeydownHandler = (event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            const textarea = event.target;
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const textBeforeCursor = value.substring(0, start);
            const regex = /(?:^|\n)\s*(\d+)([).])\s/g;
            let lastNum = 0;
            let delimiter = ')';
            let match;
            while ((match = regex.exec(textBeforeCursor)) !== null) {
                const currentNum = parseInt(match[1], 10);
                if (currentNum >= lastNum) {
                    lastNum = currentNum;
                    delimiter = match[2];
                }
            }
            const nextNum = lastNum + 1;
            let prefix = '\n\n';
            if (start === 0) {
                prefix = '';
            } else {
                const charBefore = value.substring(start - 1, start);
                if (charBefore === '\n') {
                    if (start >= 2 && value.substring(start - 2, start) === '\n\n') {
                        prefix = '';
                    } else {
                        prefix = '\n';
                    }
                }
            }
            const insertionText = prefix + nextNum + delimiter + ' ';
            textarea.value = value.substring(0, start) + insertionText + value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + insertionText.length;
            textarea.scrollTop = textarea.scrollHeight;
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
    };
    clientNotes.addEventListener('keydown', State.clientNotesKeydownHandler);
    console.log(`${LOG_PREFIX} Обработчик 'keydown' (Ctrl+Enter) успешно привязан.`);

    function getInnAtCursor(ta) {
        const text = ta.value || '';
        const n = text.length;
        const isDigit = (ch) => ch >= '0' && ch <= '9';
        const basePos = ta.selectionStart ?? 0;
        console.log(`[getInnAtCursor] Base position (selectionStart): ${basePos}`);
        const candidates = [basePos, basePos - 1, basePos + 1, basePos - 2, basePos + 2];
        for (const p of candidates) {
            if (p < 0 || p >= n) continue;
            if (!isDigit(text[p])) continue;
            let l = p,
                r = p + 1;
            while (l > 0 && isDigit(text[l - 1])) l--;
            while (r < n && isDigit(text[r])) r++;
            const token = text.slice(l, r);
            if (token.length === 10 || token.length === 12) {
                console.log(`[getInnAtCursor] Found valid INN: "${token}" at [${l}, ${r}]`);
                return { inn: token, start: l, end: r };
            }
        }
        console.log(`[getInnAtCursor] No INN found at position ${basePos}.`);
        return null;
    }

    const clientNotesCtrlMouseDownHandler = async (event) => {
        console.log(
            `[ClientNotes Handler] Event triggered: ${event.type}. Ctrl/Meta: ${
                event.ctrlKey || event.metaKey
            }`,
        );
        if (!(event.ctrlKey || event.metaKey)) return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        if (!__acquireCopyLock(250)) return;

        await new Promise((resolve) => setTimeout(resolve, 0));

        console.log(
            `[ClientNotes Handler] Before getInnAtCursor: selectionStart=${clientNotes.selectionStart}, selectionEnd=${clientNotes.selectionEnd}`,
        );
        const hit = getInnAtCursor(clientNotes);

        if (!hit) {
            console.log('[ClientNotes Handler] INN not found, handler exits without action.');
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        try {
            clientNotes.setSelectionRange(hit.start, hit.end);
            if (typeof deps.copyToClipboard === 'function') {
                await deps.copyToClipboard(hit.inn, `ИНН ${hit.inn} скопирован!`);
            } else {
                console.warn('[ClientDataSystem] copyToClipboard не задан.');
            }
        } catch (e) {
            console.error('[ClientDataSystem] Ошибка копирования ИНН по Ctrl+MouseDown:', e);
        }
    };

    clientNotes.addEventListener('mousedown', clientNotesCtrlMouseDownHandler);
    State.clientNotesCtrlClickHandler = clientNotesCtrlMouseDownHandler;
    console.log(`${LOG_PREFIX} Обработчик 'mousedown' (Ctrl+Click INN→copy) привязан.`);

    State.clientNotesCtrlKeyDownHandler = (e) => {
        const isClientNotesFocused = document.activeElement === clientNotes;
        const ctrlOrMeta = e.ctrlKey || e.metaKey;
        if (ctrlOrMeta && isClientNotesFocused) {
            ensureInnPreviewStyles();
            if (!window.__clientNotesInnPreview) {
                window.__clientNotesInnPreview = createClientNotesInnPreview(clientNotes);
            }
            const p = window.__clientNotesInnPreview;
            p.show();
            p.update();
            if (!window.__clientNotesInnPreviewInputHandler) {
                window.__clientNotesInnPreviewInputHandler = () => {
                    if (window.__clientNotesInnPreview) window.__clientNotesInnPreview.update();
                };
                clientNotes.addEventListener('input', window.__clientNotesInnPreviewInputHandler);
            }
        }
    };
    State.clientNotesCtrlKeyUpHandler = (e) => {
        if (!e.ctrlKey && !e.metaKey) {
            clientNotes.style.cursor = '';
            if (window.__clientNotesInnPreview) window.__clientNotesInnPreview.hide();
        }
    };
    State.clientNotesBlurHandler = () => {
        clientNotes.style.cursor = '';
        if (window.__clientNotesInnPreview) window.__clientNotesInnPreview.hide();
    };
    document.addEventListener('keydown', State.clientNotesCtrlKeyDownHandler);
    document.addEventListener('keyup', State.clientNotesCtrlKeyUpHandler);
    clientNotes.addEventListener('blur', State.clientNotesBlurHandler);
    console.log(`${LOG_PREFIX} Индикация курсора при Ctrl/Meta активирована.`);

    if (clearClientDataBtn) {
        clearClientDataBtn.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите очистить все данные по обращению?')) {
                clearClientData();
            }
        });
    }

    if (buttonContainer) {
        const existingExportBtn = document.getElementById('exportTextBtn');
        if (!existingExportBtn) {
            const exportTextBtn = document.createElement('button');
            exportTextBtn.id = 'exportTextBtn';
            exportTextBtn.innerHTML = `<i class="fas fa-file-download"></i><span class="hidden lg:inline lg:ml-1">Сохранить .txt</span>`;
            exportTextBtn.className = `p-2 lg:px-3 lg:py-1.5 text-white rounded-md transition text-sm flex items-center border-b`;
            exportTextBtn.title = 'Сохранить заметки как .txt файл';
            exportTextBtn.addEventListener('click', exportClientDataToTxt);
            buttonContainer.appendChild(exportTextBtn);
        }
    }

    try {
        console.log(`${LOG_PREFIX} Загрузка начальных данных для clientNotes...`);
        let clientDataNotesValue = '';
        if (State.db) {
            const clientDataFromDB = await getFromIndexedDB('clientData', 'current');
            if (clientDataFromDB && clientDataFromDB.notes) {
                clientDataNotesValue = clientDataFromDB.notes;
            }
        } else {
            const localData = localStorage.getItem('clientData');
            if (localData) {
                try {
                    clientDataNotesValue = JSON.parse(localData).notes || '';
                } catch (e) {
                    console.warn(
                        '[initClientDataSystem] Ошибка парсинга clientData из localStorage:',
                        e,
                    );
                }
            }
        }
        clientNotes.value = clientDataNotesValue;
        console.log(`${LOG_PREFIX} Данные загружены. clientNotes.value установлен.`);

        applyClientNotesFontSize();
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при загрузке данных клиента:`, error);
    }

    console.log(`${LOG_PREFIX} Инициализация системы данных клиента полностью завершена.`);
    // ensureBodyScrollUnlocked вызывается внутри createClientNotesInnPreview при необходимости
    // Убеждаемся, что нет открытых модальных окон перед разблокировкой скролла
    try {
        const visibleModals =
            typeof deps.getVisibleModals === 'function' ? deps.getVisibleModals() : [];
        if (visibleModals.length === 0) {
            document.body.classList.remove('modal-open', 'overflow-hidden');
            if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
            if (document.documentElement.style.overflow === 'hidden')
                document.documentElement.style.overflow = '';
        }
    } catch (e) {
        console.warn('[initClientDataSystem] Ошибка при проверке модальных окон:', e);
    }
}

/**
 * Проверяет условия и устанавливает приветственный текст для заметок клиента
 */
export async function checkAndSetWelcomeText() {
    console.log(
        '[checkAndSetWelcomeText] Проверка условий для отображения приветственного текста...',
    );
    const clientNotesTextarea = document.getElementById('clientNotes');

    if (!clientNotesTextarea) {
        console.error(
            '[checkAndSetWelcomeText] Textarea #clientNotes не найдена. Приветственный текст не будет установлен.',
        );
        return;
    }

    if (
        !State.userPreferences ||
        typeof State.userPreferences.welcomeTextShownInitially === 'undefined'
    ) {
        console.error(
            '[checkAndSetWelcomeText] State.userPreferences не загружены или не содержат флага welcomeTextShownInitially. Выход.',
        );
        return;
    }

    if (State.userPreferences.welcomeTextShownInitially === true) {
        console.log(
            '[checkAndSetWelcomeText] Приветственный текст не будет показан, так как флаг welcomeTextShownInitially уже установлен.',
        );
        return;
    }

    const notesAreEmpty = !clientNotesTextarea.value || clientNotesTextarea.value.trim() === '';
    const algorithms = deps.algorithms;
    const defaultMainAlgorithm = deps.DEFAULT_MAIN_ALGORITHM;

    if (
        !algorithms ||
        typeof algorithms !== 'object' ||
        !algorithms.main ||
        typeof defaultMainAlgorithm !== 'object' ||
        defaultMainAlgorithm === null
    ) {
        console.error(
            "[checkAndSetWelcomeText] Глобальные переменные 'algorithms.main' или 'DEFAULT_MAIN_ALGORITHM' не определены или некорректны!",
        );
        return;
    }

    const currentMainAlgoStepsNormalized = normalizeAlgorithmSteps(algorithms.main.steps || []);
    const defaultMainAlgoStepsNormalized = normalizeAlgorithmSteps(
        defaultMainAlgorithm.steps || [],
    );

    const currentMainAlgoCore = { ...algorithms.main };
    delete currentMainAlgoCore.steps;
    const defaultMainAlgoCore = { ...defaultMainAlgorithm };
    delete defaultMainAlgoCore.steps;

    const coreFieldsMatch = deepEqual(currentMainAlgoCore, defaultMainAlgoCore);
    const stepsMatch = deepEqual(currentMainAlgoStepsNormalized, defaultMainAlgoStepsNormalized);
    const isMainAlgorithmDefault = coreFieldsMatch && stepsMatch;

    console.log(
        `[checkAndSetWelcomeText - Условия] notesAreEmpty: ${notesAreEmpty}, isMainAlgorithmDefault: ${isMainAlgorithmDefault} (coreFieldsMatch: ${coreFieldsMatch}, stepsMatch: ${stepsMatch}), welcomeTextShownInitially: ${State.userPreferences.welcomeTextShownInitially}`,
    );

    if (notesAreEmpty && isMainAlgorithmDefault) {
        clientNotesTextarea.value = DEFAULT_WELCOME_CLIENT_NOTES_TEXT;
        console.log(
            '[checkAndSetWelcomeText] Приветственный текст успешно установлен в #clientNotes.',
        );

        State.userPreferences.welcomeTextShownInitially = true;
        if (typeof deps.saveUserPreferences === 'function') {
            try {
                await deps.saveUserPreferences();
                console.log(
                    '[checkAndSetWelcomeText] Флаг welcomeTextShownInitially установлен и настройки пользователя сохранены.',
                );
            } catch (error) {
                console.error(
                    '[checkAndSetWelcomeText] Ошибка при сохранении userPreferences после установки флага:',
                    error,
                );
            }
        } else {
            console.warn(
                '[checkAndSetWelcomeText] Функция saveUserPreferences не найдена. Флаг welcomeTextShownInitially может не сохраниться.',
            );
        }

        setTimeout(() => {
            saveClientData();
            console.log(
                '[checkAndSetWelcomeText] Данные клиента (с приветственным текстом) сохранены.',
            );
        }, 100);
    } else {
        if (!notesAreEmpty) {
            console.log(
                '[checkAndSetWelcomeText] Приветственный текст не установлен: поле заметок не пусто.',
            );
        }
        if (!isMainAlgorithmDefault) {
            console.log(
                '[checkAndSetWelcomeText] Приветственный текст не установлен: главный алгоритм был изменен или не соответствует дефолтному.',
            );
            if (!coreFieldsMatch) console.log('   - Основные поля алгоритма не совпадают.');
            if (!stepsMatch) console.log('   - Шаги алгоритма не совпадают.');
        }
    }
}
