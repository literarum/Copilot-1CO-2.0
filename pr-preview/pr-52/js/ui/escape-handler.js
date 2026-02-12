'use strict';

let deps = {
    getVisibleModals: null,
    getTopmostModal: null,
};

export function setEscapeHandlerDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function addEscapeHandler(modalElement) {
    if (!modalElement || modalElement._escapeHandlerInstance) return;

    const handleEscape = (event) => {
        if (event.key === 'Escape') {
            const visibleModals = deps.getVisibleModals?.() ?? [];
            const topmost = deps.getTopmostModal?.(visibleModals);
            if (topmost && topmost.id === modalElement.id) {
                modalElement.classList.add('hidden');
                removeEscapeHandler(modalElement);
                event.stopPropagation();
            }
        }
    };

    modalElement._escapeHandlerInstance = handleEscape;
    document.addEventListener('keydown', handleEscape);
}

export function removeEscapeHandler(modalElement) {
    if (!modalElement || !modalElement._escapeHandlerInstance) return;
    document.removeEventListener('keydown', modalElement._escapeHandlerInstance);
    delete modalElement._escapeHandlerInstance;
}
