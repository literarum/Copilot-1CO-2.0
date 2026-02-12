'use strict';

let deps = {
    deleteAlgorithm: null,
    showNotification: null,
    editAlgorithm: null,
    ExportService: null,
    closeAnimatedModal: null,
};

export function setAlgorithmModalControlDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initAlgorithmModalControls() {
    const algorithmModal = document.getElementById('algorithmModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const editMainBtn = document.getElementById('editMainBtn');
    const deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');

    closeModalBtn?.addEventListener('click', () => {
        if (typeof deps.closeAnimatedModal === 'function') {
            deps.closeAnimatedModal(algorithmModal);
        }
    });

    editMainBtn?.addEventListener('click', async () => {
        if (typeof deps.editAlgorithm === 'function') {
            await deps.editAlgorithm('main');
        } else {
            console.error('Функция editAlgorithm не найдена для кнопки editMainBtn');
        }
    });

    const exportMainBtn = document.getElementById('exportMainBtn');
    if (exportMainBtn) {
        exportMainBtn.addEventListener('click', () => {
            const mainAlgorithmContainer = document.getElementById('mainAlgorithm');
            const mainTitleElement = document.querySelector('#mainContent h2');
            const title = mainTitleElement ? mainTitleElement.textContent : 'Главная';
            deps.ExportService?.exportElementToPdf(mainAlgorithmContainer, title);
        });
    }

    if (!deleteAlgorithmBtn) return;

    const clickHandler = async (event) => {
        const button = event.currentTarget;
        const currentModal = button.closest('#algorithmModal');

        if (!currentModal) {
            deps.showNotification?.(
                'Ошибка: Не удалось определить контекст для удаления.',
                'error',
            );
            return;
        }

        const algorithmIdToDelete = currentModal.dataset.currentAlgorithmId;
        const sectionToDelete = currentModal.dataset.currentSection;

        if (!algorithmIdToDelete || !sectionToDelete) {
            deps.showNotification?.('Ошибка: Не удалось определить алгоритм для удаления.', 'error');
            return;
        }

        if (sectionToDelete === 'main') {
            deps.showNotification?.('Главный алгоритм удалить нельзя.', 'warning');
            return;
        }

        const modalTitleElement = document.getElementById('modalTitle');
        const algorithmTitle = modalTitleElement
            ? modalTitleElement.textContent
            : `алгоритм с ID ${algorithmIdToDelete}`;

        if (
            confirm(
                `Вы уверены, что хотите удалить алгоритм "${algorithmTitle}"? Это действие необратимо.`,
            )
        ) {
            currentModal.classList.add('hidden');

            try {
                if (typeof deps.deleteAlgorithm === 'function') {
                    await deps.deleteAlgorithm(algorithmIdToDelete, sectionToDelete);
                } else {
                    throw new Error('Функция удаления недоступна.');
                }
            } catch (error) {
                console.error('Ошибка при вызове deleteAlgorithm:', error);
                deps.showNotification?.(
                    'Произошла ошибка при попытке удаления алгоритма.',
                    'error',
                );
            }
        }
    };

    if (deleteAlgorithmBtn._clickHandler) {
        deleteAlgorithmBtn.removeEventListener('click', deleteAlgorithmBtn._clickHandler);
    }
    deleteAlgorithmBtn.addEventListener('click', clickHandler);
    deleteAlgorithmBtn._clickHandler = clickHandler;

    initAdditionalAlgorithmUiControls();
}


export function initAdditionalAlgorithmUiControls() {
    const bindClose = (buttonId, modalId) => {
        const button = document.getElementById(buttonId);
        const modal = document.getElementById(modalId);
        if (!button || !modal || typeof deps.closeAnimatedModal !== 'function') return;
        if (button._closeHandler) button.removeEventListener('click', button._closeHandler);
        button._closeHandler = () => deps.closeAnimatedModal(modal);
        button.addEventListener('click', button._closeHandler);
    };

    bindClose('closeEditModalBtn', 'editModal');
    bindClose('cancelEditBtn', 'editModal');
    bindClose('closeAddModalBtn', 'addModal');
    bindClose('cancelAddBtn', 'addModal');

    const addButtonToSectionMap = {
        addProgramAlgorithmBtn: 'program',
        addSkziAlgorithmBtn: 'skzi',
        addLk1cAlgorithmBtn: 'lk1c',
        addWebRegAlgorithmBtn: 'webReg',
        addCibAlgorithmBtn: 'cib',
    };

    Object.entries(addButtonToSectionMap).forEach(([buttonId, sectionId]) => {
        const button = document.getElementById(buttonId);
        if (!button) return;
        if (button._openAddModalHandler) {
            button.removeEventListener('click', button._openAddModalHandler);
        }
        button._openAddModalHandler = () => {
            if (typeof window.showAddModal === 'function') {
                window.showAddModal(sectionId);
            }
        };
        button.addEventListener('click', button._openAddModalHandler);
    });
}

window.initAdditionalAlgorithmUiControls = initAdditionalAlgorithmUiControls;
