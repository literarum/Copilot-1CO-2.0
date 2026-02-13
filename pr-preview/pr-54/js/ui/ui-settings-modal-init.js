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
    updatePreviewSettingsFromModal: null,
    applyPreviewSettings: null,
    initColorPicker: null,
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
        const closeModal = async () => {
            if (deps.State?.originalUISettings && typeof deps.applyPreviewSettings === 'function') {
                deps.State.currentPreviewSettings = JSON.parse(
                    JSON.stringify(deps.State.originalUISettings),
                );
                await deps.applyPreviewSettings(deps.State.originalUISettings);
                deps.State.isUISettingsDirty = false;
                if (typeof deps.populateModalControls === 'function') {
                    deps.populateModalControls(deps.State.originalUISettings);
                }
            }
            if (typeof deps.closeAnimatedModal === 'function') {
                deps.closeAnimatedModal(customizeUIModal);
            }
            document.body.classList.remove('modal-open');
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
        if (cancelUISettingsBtn) cancelUISettingsBtn.addEventListener('click', closeModal);
        if (closeCustomizeUIModalBtn)
            closeCustomizeUIModalBtn.addEventListener('click', closeModal);
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

        customizeUIModal.addEventListener('change', (e) => {
            if (e.target.matches('input[name="mainLayout"], input[name="themeMode"]')) {
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

        customizeUIModal.dataset.settingsInnerListenersAttached = 'true';
        console.log('[UISettingsModal] Обработчики элементов модального окна настроек установлены.');
    }
}
