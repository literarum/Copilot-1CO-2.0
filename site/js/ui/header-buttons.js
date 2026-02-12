'use strict';

let deps = {
    setActiveTab: null,
};

export function setHeaderButtonsDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initHeaderButtons() {
    const showFavoritesHeaderButton = document.getElementById('showFavoritesHeaderBtn');
    if (showFavoritesHeaderButton && !showFavoritesHeaderButton.dataset.listenerAttached) {
        showFavoritesHeaderButton.addEventListener('click', () => {
            if (typeof deps.setActiveTab === 'function') {
                deps.setActiveTab('favorites');
            }
        });
        showFavoritesHeaderButton.dataset.listenerAttached = 'true';
    }


    const openAdvancedSearchModalBtn = document.getElementById('openAdvancedSearchModalBtn');
    const legacySearchSettingsBtn = document.getElementById('toggleAdvancedSearch');
    const advancedSearchModal = document.getElementById('advancedSearchModal');
    const closeAdvancedSearchModalBtn = document.getElementById('closeAdvancedSearchModalBtn');
    const advancedSearchOptions = document.getElementById('advancedSearchOptions');
    const advancedSearchModalHost = document.getElementById('advancedSearchOptionsModalHost');

    if (advancedSearchOptions && advancedSearchModalHost && !advancedSearchModalHost.contains(advancedSearchOptions)) {
        advancedSearchOptions.classList.remove('hidden', 'mb-3');
        advancedSearchOptions.classList.add('bg-transparent', 'dark:bg-transparent', 'p-0', 'rounded-none', 'mb-0');
        advancedSearchModalHost.appendChild(advancedSearchOptions);
    }

    const openAdvancedSearchModal = () => {
        if (!advancedSearchModal) return;
        advancedSearchModal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    };

    const closeAdvancedSearchModal = () => {
        if (!advancedSearchModal) return;
        advancedSearchModal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    };

    openAdvancedSearchModalBtn?.addEventListener('click', openAdvancedSearchModal);
    legacySearchSettingsBtn?.addEventListener('click', openAdvancedSearchModal);
    closeAdvancedSearchModalBtn?.addEventListener('click', closeAdvancedSearchModal);
    advancedSearchModal?.addEventListener('click', (event) => {
        if (event.target === advancedSearchModal) {
            closeAdvancedSearchModal();
        }
    });

}
