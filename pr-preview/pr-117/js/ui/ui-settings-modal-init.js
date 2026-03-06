'use strict';

let deps = {
    State: null,
    loadUISettings: null,
    populateModalControls: null,
    setColorPickerStateFromHex: null,
    addEscapeHandler: null,
    openAnimatedModal: null,
    closeAnimatedModal: null,
    saveUISettings: null,
    resetUISettingsInModal: null,
    revertUISettingsOnDiscard: null,
    updatePreviewSettingsFromModal: null,
    applyPreviewSettings: null,
    initColorPicker: null,
    showUnsavedConfirmModal: null,
    setupExtensionFieldListeners: null,
    loadEmployeeExtension: null,
};

export function setUISettingsModalInitDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initUISettingsModalHandlers() {
    const customizeUIBtn = document.getElementById('customizeUIBtn');
    const customizeUIModal = document.getElementById('customizeUIModal');

    if (customizeUIBtn && customizeUIModal && !customizeUIBtn.dataset.settingsListenerAttached) {
        customizeUIBtn.addEventListener('click', async () => {
            if (customizeUIModal.classList.contains('hidden')) {
                if (typeof deps.loadUISettings === 'function') await deps.loadUISettings();
                if (typeof deps.loadEmployeeExtension === 'function') await deps.loadEmployeeExtension();
                if (typeof deps.populateModalControls === 'function') {
                    deps.populateModalControls(
                        deps.State?.currentPreviewSettings || deps.State?.userPreferences,
                    );
                }
                if (typeof deps.setColorPickerStateFromHex === 'function') {
                    const hex =
                        deps.State?.currentPreviewSettings?.primaryColor ||
                        deps.State?.userPreferences?.primaryColor;
                    deps.setColorPickerStateFromHex(hex || '#9933FF');
                }
                if (deps.State) deps.State.isUISettingsDirty = false;
                customizeUIModal.classList.remove('hidden');
                document.body.classList.add('modal-open');
                if (typeof deps.addEscapeHandler === 'function') {
                    deps.addEscapeHandler(customizeUIModal);
                }
                if (typeof deps.openAnimatedModal === 'function') {
                    deps.openAnimatedModal(customizeUIModal);
                }
            }
        });
        customizeUIBtn.dataset.settingsListenerAttached = 'true';
        console.log('[UISettingsModal] Обработчик открытия модального окна настроек установлен.');
    }

    if (customizeUIModal && !customizeUIModal.dataset.settingsInnerListenersAttached) {
        const closeModal = () => {
            if (typeof deps.closeAnimatedModal === 'function') {
                deps.closeAnimatedModal(customizeUIModal);
            }
            document.body.classList.remove('modal-open');
        };

        const requestClose = async () => {
            if (
                deps.State?.isUISettingsDirty &&
                typeof deps.showUnsavedConfirmModal === 'function'
            ) {
                const leave = await deps.showUnsavedConfirmModal();
                if (!leave) return;
                if (typeof deps.revertUISettingsOnDiscard === 'function') {
                    await deps.revertUISettingsOnDiscard();
                }
            }
            closeModal();
        };

        const saveUISettingsBtn = document.getElementById('saveUISettingsBtn');
        const cancelUISettingsBtn = document.getElementById('cancelUISettingsBtn');
        const resetUiBtn = document.getElementById('resetUiBtn');
        const closeCustomizeUIModalBtn = document.getElementById('closeCustomizeUIModalBtn');
        const decreaseFontBtn = document.getElementById('decreaseFontBtn');
        const increaseFontBtn = document.getElementById('increaseFontBtn');
        const resetFontBtn = document.getElementById('resetFontBtn');
        const fontSizeLabel = customizeUIModal.querySelector('#fontSizeLabel');
        const borderRadiusSlider = customizeUIModal.querySelector('#borderRadiusSlider');
        const densitySlider = customizeUIModal.querySelector('#densitySlider');

        if (saveUISettingsBtn) {
            saveUISettingsBtn.addEventListener('click', async () => {
                if (typeof deps.saveUISettings === 'function') {
                    const ok = await deps.saveUISettings();
                    if (ok) closeModal();
                }
            });
        }
        if (cancelUISettingsBtn)
            cancelUISettingsBtn.addEventListener('click', () => void requestClose());
        if (closeCustomizeUIModalBtn)
            closeCustomizeUIModalBtn.addEventListener('click', () => void requestClose());
        if (resetUiBtn) {
            resetUiBtn.addEventListener('click', async () => {
                if (typeof deps.resetUISettingsInModal === 'function') {
                    await deps.resetUISettingsInModal();
                }
            });
        }

        const FONT_MIN = 80;
        const FONT_MAX = 150;
        const FONT_STEP = 10;
        const updateFontLabelAndPreview = () => {
            if (fontSizeLabel && typeof deps.updatePreviewSettingsFromModal === 'function') {
                deps.updatePreviewSettingsFromModal();
                if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                    deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                }
                deps.State.isUISettingsDirty = true;
            }
        };
        if (decreaseFontBtn && fontSizeLabel) {
            decreaseFontBtn.addEventListener('click', () => {
                const v = Math.max(
                    FONT_MIN,
                    (parseInt(fontSizeLabel.textContent, 10) || 100) - FONT_STEP,
                );
                fontSizeLabel.textContent = v + '%';
                updateFontLabelAndPreview();
            });
        }
        if (increaseFontBtn && fontSizeLabel) {
            increaseFontBtn.addEventListener('click', () => {
                const v = Math.min(
                    FONT_MAX,
                    (parseInt(fontSizeLabel.textContent, 10) || 100) + FONT_STEP,
                );
                fontSizeLabel.textContent = v + '%';
                updateFontLabelAndPreview();
            });
        }
        if (resetFontBtn && fontSizeLabel) {
            resetFontBtn.addEventListener('click', () => {
                fontSizeLabel.textContent = '100%';
                updateFontLabelAndPreview();
            });
        }

        if (borderRadiusSlider) {
            borderRadiusSlider.addEventListener('input', () => {
                if (typeof deps.updatePreviewSettingsFromModal === 'function') {
                    deps.updatePreviewSettingsFromModal();
                    if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                        deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                    }
                    deps.State.isUISettingsDirty = true;
                }
            });
        }
        if (densitySlider) {
            densitySlider.addEventListener('input', () => {
                if (typeof deps.updatePreviewSettingsFromModal === 'function') {
                    deps.updatePreviewSettingsFromModal();
                    if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                        deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                    }
                    deps.State.isUISettingsDirty = true;
                }
            });
        }

        function showHealthReportModalFallback(report) {
            const modal = document.getElementById('healthReportModal');
            if (!modal) return;
            const body = modal.querySelector('#healthReportModalBody');
            if (!body) return;
            const buildList = (items, emptyText) => {
                if (!items?.length) return `<p class="text-xs opacity-70">${emptyText}</p>`;
                return `<ul class="space-y-2">${items
                    .map(
                        (i) =>
                            `<li><strong>${i.title}</strong><div class="text-xs opacity-80">${i.message}</div></li>`,
                    )
                    .join('')}</ul>`;
            };
            const statusClass = report.success
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400';
            const statusText = report.success ? 'Система в норме' : 'Обнаружены проблемы';
            body.innerHTML = `
                <div class="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <strong>Полный отчёт о состоянии здоровья приложения</strong>
                    <div class="text-sm mt-1">
                        <span class="${statusClass}">${statusText}</span>
                        ${report.startedAt ? ` · Начало: ${report.startedAt}` : ''}
                        ${report.finishedAt ? ` · Окончание: ${report.finishedAt}` : ''}
                    </div>
                </div>
                <div class="hud-modal-section">
                    <h4>Ошибки</h4>
                    ${buildList(report.errors, 'Ошибок не обнаружено.')}
                </div>
                <div class="hud-modal-section">
                    <h4>Предупреждения</h4>
                    ${buildList(report.warnings, 'Предупреждений нет.')}
                </div>
                <div class="hud-modal-section">
                    <h4>Проверки (все слои, хранилища, надёжность данных)</h4>
                    ${buildList(report.checks, 'Список проверок пуст.')}
                </div>
            `;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }

        const healthReportModalClose = document.getElementById('healthReportModalClose');
        const healthReportModal = document.getElementById('healthReportModal');
        if (healthReportModalClose && healthReportModal) {
            healthReportModalClose.addEventListener('click', () => {
                healthReportModal.classList.add('hidden');
                healthReportModal.style.display = 'none';
            });
            healthReportModal.addEventListener('click', (e) => {
                if (e.target === healthReportModal) {
                    healthReportModal.classList.add('hidden');
                    healthReportModal.style.display = 'none';
                }
            });
        }

        customizeUIModal.addEventListener('change', (e) => {
            if (
                e.target.matches(
                    'input[name="themeMode"], input[name="staticHeader"]',
                )
            ) {
                if (typeof deps.updatePreviewSettingsFromModal === 'function') {
                    deps.updatePreviewSettingsFromModal();
                    if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                        deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                    }
                    deps.State.isUISettingsDirty = true;
                }
            }
        });

        if (typeof deps.initColorPicker === 'function') deps.initColorPicker();
        if (typeof deps.setupExtensionFieldListeners === 'function') deps.setupExtensionFieldListeners();

        const toggleManualHealthRun = customizeUIModal.querySelector('#toggleManualHealthRun');
        const runManualHealthCheckBtn = document.getElementById('runManualHealthCheckBtn');
        if (runManualHealthCheckBtn) {
            const updateManualRunButtonState = () => {
                const enabled = !toggleManualHealthRun || toggleManualHealthRun.checked;
                runManualHealthCheckBtn.disabled = !enabled;
            };
            if (toggleManualHealthRun) {
                toggleManualHealthRun.addEventListener('change', updateManualRunButtonState);
                updateManualRunButtonState();
            }
            runManualHealthCheckBtn.addEventListener('click', async () => {
                if (runManualHealthCheckBtn.disabled) return;
                const runManualFullDiagnostic = window.runManualFullDiagnostic;
                if (typeof runManualFullDiagnostic !== 'function') {
                    console.error('[UISettingsModal] runManualFullDiagnostic не найден.');
                    return;
                }
                runManualHealthCheckBtn.disabled = true;
                runManualHealthCheckBtn.innerHTML =
                    '<i class="fas fa-spinner fa-spin mr-2"></i>Проверка...';
                try {
                    const report = await runManualFullDiagnostic();
                    showHealthReportModalFallback(report);
                } catch (err) {
                    console.error('[UISettingsModal] Ошибка ручного прогона:', err);
                    showHealthReportModalFallback({
                        errors: [{ title: 'Ошибка', message: err.message }],
                        warnings: [],
                        checks: [],
                        startedAt: new Date().toLocaleString('ru-RU'),
                        finishedAt: new Date().toLocaleString('ru-RU'),
                        success: false,
                        error: err.message,
                    });
                } finally {
                    runManualHealthCheckBtn.disabled = !toggleManualHealthRun?.checked;
                    runManualHealthCheckBtn.innerHTML =
                        '<i class="fas fa-stethoscope mr-2"></i>Запустить полную проверку';
                }
            });
        }

        customizeUIModal.dataset.settingsInnerListenersAttached = 'true';
        console.log(
            '[UISettingsModal] Обработчики элементов модального окна настроек установлены.',
        );
    }
}
