'use strict';

// ============================================================================
// ИМПОРТЫ ИЗ МОДУЛЕЙ
// ============================================================================
import {
    DB_NAME,
    DB_VERSION,
    CURRENT_SCHEMA_VERSION,
    CATEGORY_INFO_KEY,
    SEDO_CONFIG_KEY,
    BLACKLIST_WARNING_ACCEPTED_KEY,
    USER_PREFERENCES_KEY,
    ARCHIVE_FOLDER_ID,
    ARCHIVE_FOLDER_NAME,
    MAX_REFS_PER_WORD,
    MAX_UPDATE_VISIBLE_TABS_RETRIES,
    MIN_TOKEN_LEN_FOR_INDEX,
    FAVORITES_STORE_NAME,
    CLIENT_NOTES_MIN_FONT_SIZE,
    CLIENT_NOTES_MAX_FONT_SIZE,
    CLIENT_NOTES_FONT_SIZE_STEP,
    SHABLONY_DOC_ID,
    EXT_LINKS_MIGRATION_KEY,
    MAIN_ALGO_COLLAPSE_KEY,
    TIMER_STATE_KEY,
    DIALOG_WATCHDOG_TIMEOUT_NEW,
    CACHE_TTL,
    FIELD_WEIGHTS,
    DEFAULT_WELCOME_CLIENT_NOTES_TEXT,
} from './js/constants.js';

import {
    categoryDisplayInfo as categoryDisplayInfoImported,
    tabsConfig,
    allPanelIdsForDefault,
    defaultPanelOrder,
    getDefaultUISettings,
    SECTION_GRID_COLS,
    CARD_CONTAINER_CLASSES,
    LIST_CONTAINER_CLASSES,
    CARD_ITEM_BASE_CLASSES,
    LIST_ITEM_BASE_CLASSES,
    ALGO_BOOKMARK_CARD_CLASSES,
    LINK_REGLAMENT_CARD_CLASSES,
    LIST_HOVER_TRANSITION_CLASSES,
    DEFAULT_CIB_LINKS,
} from './js/config.js';

// Настройки UI по умолчанию (используются в loadUserPreferences, applyUISettings и др.)
const DEFAULT_UI_SETTINGS = getDefaultUISettings(defaultPanelOrder);

// Создаём мутабельную копию categoryDisplayInfo для совместимости со старым кодом
let categoryDisplayInfo = { ...categoryDisplayInfoImported };

import { escapeHtml, escapeHTML, normalizeBrokenEntities, decodeBasicEntitiesOnce, truncateText, highlightText, highlightTextInString, highlightElement, highlightTextInElement, linkify as linkifyModule } from './js/utils/html.js';

import { escapeRegExp, base64ToBlob, formatExampleForTextarea, getSectionName, getStepContentAsText, debounce, deepEqual as deepEqualModule, setupClearButton as setupClearButtonModule } from './js/utils/helpers.js';

import { setClipboardDependencies, copyToClipboard as copyToClipboardModule } from './js/utils/clipboard.js';

import {
    hexToRgb as hexToRgbModule,
    rgbToHex as rgbToHexModule,
    rgbToHsb as rgbToHsbModule,
    hsbToRgb as hsbToRgbModule,
    hexToHsl as hexToHslModule,
    hslToHex as hslToHexModule,
    getLuminance as getLuminanceModule,
    adjustHsl as adjustHslModule,
    calculateSecondaryColor as calculateSecondaryColorModule,
} from './js/utils/color.js';

import {
    setModalDependencies,
    openAnimatedModal as openAnimatedModalModule,
    closeAnimatedModal as closeAnimatedModalModule,
} from './js/utils/modal.js';

import { 
    initDB, 
    getAllFromIndexedDB, 
    performDBOperation, 
    saveToIndexedDB, 
    getFromIndexedDB, 
    deleteFromIndexedDB, 
    clearIndexedDBStore, 
    getAllFromIndex 
} from './js/db/indexeddb.js';

import { storeConfigs } from './js/db/stores.js';

import { 
    addToFavoritesDB, 
    removeFromFavoritesDB, 
    isFavoriteDB, 
    getAllFavoritesDB, 
    clearAllFavoritesDB, 
    loadInitialFavoritesCache 
} from './js/db/favorites.js';

import { NotificationService } from './js/services/notification.js';

import { ExportService, setLoadingOverlayManager } from './js/services/export.js';

import { loadingOverlayManager } from './js/ui/loading-overlay-manager.js';

import { State } from './js/app/state.js';

import {
    setAppInitDependencies,
    appInit as appInitModule,
} from './js/app/app-init.js';

import {
    setDataLoaderDependencies,
    loadFromIndexedDB as loadFromIndexedDBModule,
    saveDataToIndexedDB as saveDataToIndexedDBModule,
} from './js/app/data-loader.js';

// User Preferences (extracted from script.js)
import {
    setUserPreferencesDependencies,
    loadUserPreferences as loadUserPreferencesModule,
    saveUserPreferences as saveUserPreferencesModule,
} from './js/app/user-preferences.js';

// Data Clear (extracted from script.js)
import {
    setDataClearDependencies,
    clearAllApplicationData as clearAllApplicationDataModule,
} from './js/app/data-clear.js';

import {
    setTheme as setThemeModule,
    migrateLegacyThemeVars as migrateLegacyThemeVarsModule,
    applyThemeOverrides as applyThemeOverridesModule,
} from './js/components/theme.js';

// Timer System
import {
    initTimerSystem,
    toggleTimer,
    resetTimer,
    adjustTimerDuration,
    showAppNotification,
    requestAppNotificationPermission
} from './js/features/timer.js';

import { initFNSCertificateRevocationSystem } from './js/features/fns-cert-revocation.js';
import {
    initAlgorithmsPdfExportSystem,
    setAlgorithmsPdfExportDependencies,
} from './js/features/algorithms-pdf-export.js';
import {
    initBackgroundHealthTestsSystem,
    setBackgroundHealthTestsDependencies,
} from './js/features/background-health-tests.js';

// PDF Attachment System
import {
    isPdfFile,
    setupPdfDragAndDrop,
    addPdfRecords,
    getPdfsForParent,
    downloadPdfBlob,
    mountPdfSection,
    renderPdfAttachmentsSection,
    initPdfAttachmentSystem,
    attachAlgorithmAddPdfHandlers,
    attachBookmarkPdfHandlers
} from './js/features/pdf-attachments.js';

// Google Docs Integration
import {
    initGoogleDocSections,
    loadAndRenderGoogleDoc,
    renderGoogleDocContent,
    fetchGoogleDocs,
    handleShablonySearch,
    parseShablonyContent
} from './js/features/google-docs.js';

// SEDO System
import {
    DEFAULT_SEDO_DATA,
    initSedoTypesSystem,
    toggleSedoEditMode,
    renderSedoTypesContent,
    saveSedoChanges,
    loadSedoData,
    filterSedoData,
    handleSedoSearch,
    highlightAndScrollSedoItem
} from './js/features/sedo.js';

// Search System
import {
    initSearchSystem,
    performSearch,
    executeSearch,
    renderSearchResults,
    handleSearchResultClick,
    tokenize,
    sanitizeQuery,
    getAlgorithmText,
    getTextForItem,
    addToSearchIndex,
    removeFromSearchIndex,
    updateSearchIndex,
    updateSearchIndexForItem,
    checkAndBuildIndex,
    buildInitialSearchIndex,
    cleanAndRebuildSearchIndex,
    setSearchDependencies,
    debouncedSearch,
    getCachedResults,
    cacheResults,
    expandQueryWithSynonyms,
    searchWithRegex,
    debug_checkIndex,
} from './js/features/search.js';

// Algorithm Components
import {
    setAlgorithmsDependencies,
    createStepElementHTML,
    normalizeAlgorithmSteps,
    renderAllAlgorithms as renderAllAlgorithmsModule,
    renderAlgorithmCards as renderAlgorithmCardsModule,
    initStepSorting as initStepSortingModule,
    addEditStep as addEditStepModule,
    extractStepsDataFromEditForm as extractStepsDataFromEditFormModule,
    addNewStep as addNewStepModule,
    getCurrentEditState as getCurrentEditStateModule,
    getCurrentAddState as getCurrentAddStateModule,
    hasChanges as hasChangesModule,
    captureInitialEditState as captureInitialEditStateModule,
    captureInitialAddState as captureInitialAddStateModule,
    resetInitialEditState,
    resetInitialAddState,
} from './js/components/algorithms.js';

// Algorithms Operations (extracted from script.js)
import {
    setAlgorithmsOperationsDependencies,
    editAlgorithm as editAlgorithmModule,
    showAddModal as showAddModalModule,
} from './js/components/algorithms-operations.js';

// Algorithms Save (extracted from script.js)
import {
    setAlgorithmsSaveDependencies,
    saveNewAlgorithm as saveNewAlgorithmModule,
    saveAlgorithm as saveAlgorithmModule,
    deleteAlgorithm as deleteAlgorithmModule,
} from './js/components/algorithms-save.js';

// Main Algorithm Component
import {
    setMainAlgorithmDependencies,
    renderMainAlgorithm as renderMainAlgorithmModule,
    loadMainAlgoCollapseState as loadMainAlgoCollapseStateModule,
    saveMainAlgoCollapseState as saveMainAlgoCollapseStateModule,
} from './js/components/main-algorithm.js';

// Reglaments Components
import {
    setReglamentsDependencies,
    populateReglamentCategoryDropdowns as populateReglamentCategoryDropdownsModule,
    loadReglaments as loadReglamentsModule,
    getAllReglaments as getAllReglamentsModule,
    getReglamentsByCategory as getReglamentsByCategoryModule,
    createCategoryElement as createCategoryElementModule,
    renderReglamentCategories as renderReglamentCategoriesModule,
    showReglamentsForCategory as showReglamentsForCategoryModule,
    handleReglamentAction as handleReglamentActionModule,
    deleteReglamentFromList as deleteReglamentFromListModule,
    showReglamentDetail as showReglamentDetailModule,
    showAddReglamentModal as showAddReglamentModalModule,
    editReglament as editReglamentModule,
    initReglamentsSystem as initReglamentsSystemModule,
} from './js/components/reglaments.js';

// Bookmark Components
import {
    restoreBookmarkFromArchive,
    moveBookmarkToArchive,
    getCurrentBookmarkFormState,
    setBookmarksDependencies,
    filterBookmarks as filterBookmarksModule,
    populateBookmarkFolders as populateBookmarkFoldersModule,
    initBookmarkSystem as initBookmarkSystemModule,
    getAllBookmarks as getAllBookmarksModule,
    loadBookmarks as loadBookmarksModule,
    renderBookmarks as renderBookmarksModule,
    createBookmarkElement as createBookmarkElementModule,
    renderBookmarkFolders as renderBookmarkFoldersModule,
    handleSaveFolderSubmit as handleSaveFolderSubmitModule,
    showOrganizeFoldersModal as showOrganizeFoldersModalModule,
    handleDeleteBookmarkFolderClick as handleDeleteBookmarkFolderClickModule,
    loadFoldersListInContainer as loadFoldersListModule,
    handleBookmarkAction as handleBookmarkActionModule,
    handleViewBookmarkScreenshots as handleViewBookmarkScreenshotsModule,
} from './js/components/bookmarks.js';

// Bookmarks Delete (extracted from script.js)
import {
    setBookmarksDeleteDependencies,
    deleteBookmark as deleteBookmarkModule,
} from './js/features/bookmarks-delete.js';

// Bookmarks Modal (extracted from script.js)
import {
    setBookmarksModalDependencies,
    ensureBookmarkModal as ensureBookmarkModalModule,
    showAddBookmarkModal as showAddBookmarkModalModule,
    showEditBookmarkModal as showEditBookmarkModalModule,
} from './js/features/bookmarks-modal.js';

// Bookmarks Form Submit (extracted from script.js)
import {
    setBookmarksFormDependencies,
    handleBookmarkFormSubmit as handleBookmarkFormSubmitModule,
} from './js/features/bookmarks-form.js';

// Bookmarks DOM Operations (extracted from script.js)
import {
    setBookmarksDomDependencies,
    addBookmarkToDOM as addBookmarkToDOMModule,
    updateBookmarkInDOM as updateBookmarkInDOMModule,
    removeBookmarkFromDOM as removeBookmarkFromDOMModule,
} from './js/features/bookmarks-dom.js';

// External Links Components
import {
    getAllExtLinks,
    loadExtLinks as loadExtLinksModule,
    createExtLinkElement as createExtLinkElementModule,
    renderExtLinks as renderExtLinksModule,
    setExtLinksDependencies,
} from './js/components/ext-links.js';

// Ext Links Form Submit (extracted from script.js)
import {
    setExtLinksFormDependencies,
    handleExtLinkFormSubmit as handleExtLinkFormSubmitModule,
} from './js/features/ext-links-form.js';

// Ext Links Modal (extracted from script.js)
import {
    setExtLinksModalDependencies,
    ensureExtLinkModal as ensureExtLinkModalModule,
    showAddExtLinkModal as showAddExtLinkModalModule,
    showEditExtLinkModal as showEditExtLinkModalModule,
    showAddEditExtLinkModal as showAddEditExtLinkModalModule,
} from './js/features/ext-links-modal.js';

// Ext Links Categories (extracted from script.js)
import {
    setExtLinksCategoriesDependencies,
    showOrganizeExtLinkCategoriesModal as showOrganizeExtLinkCategoriesModalModule,
    handleSaveExtLinkCategorySubmit as handleSaveExtLinkCategorySubmitModule,
    handleDeleteExtLinkCategoryClick as handleDeleteExtLinkCategoryClickModule,
    populateExtLinkCategoryFilter as populateExtLinkCategoryFilterModule,
} from './js/features/ext-links-categories.js';

// Ext Links Actions (extracted from script.js)
import {
    setExtLinksActionsDependencies,
    filterExtLinks as filterExtLinksModule,
    handleExtLinkAction as handleExtLinkActionModule,
} from './js/features/ext-links-actions.js';

// Ext Links Init (extracted from script.js)
import {
    setExtLinksInitDependencies,
    initExternalLinksSystem as initExternalLinksSystemModule,
} from './js/features/ext-links-init.js';

// Favorites System
import {
    setFavoritesDependencies,
    initFavoritesSystem,
    toggleFavorite as toggleFavoriteModule,
    updateFavoriteStatusUI as updateFavoriteStatusUIModule,
    renderFavoritesPage as renderFavoritesPageModule,
    getFavoriteButtonHTML as getFavoriteButtonHTMLModule,
    handleFavoriteContainerClick as handleFavoriteContainerClickModule,
    handleFavoriteActionClick as handleFavoriteActionClickModule,
    isFavorite as isFavoriteModule,
    refreshAllFavoritableSectionsUI as refreshAllFavoritableSectionsUIModule,
} from './js/features/favorites.js';

// Алиас для глобального использования в appInit и при экспорте в window
const handleFavoriteActionClick = handleFavoriteActionClickModule;

// CIB Links System
import {
    setCibLinksDependencies,
    initCibLinkSystem as initCibLinkSystemModule,
    initCibLinkModal as initCibLinkModalModule,
    showAddEditCibLinkModal as showAddEditCibLinkModalModule,
    handleLinkActionClick as handleLinkActionClickModule,
    loadCibLinks as loadCibLinksModule,
    getAllCibLinks as getAllCibLinksModule,
    renderCibLinks as renderCibLinksModule,
    handleCibLinkSubmit as handleCibLinkSubmitModule,
    deleteCibLink as deleteCibLinkModule,
    filterLinks as filterLinksModule,
} from './js/features/cib-links.js';

// Blacklist System
import {
    setBlacklistDependencies,
    initBlacklistSystem as initBlacklistSystemModule,
    loadBlacklistedClients as loadBlacklistedClientsModule,
    handleBlacklistSearchInput as handleBlacklistSearchInputModule,
    renderBlacklistTable as renderBlacklistTableModule,
    sortAndRenderBlacklist as sortAndRenderBlacklistModule,
    exportBlacklistToExcel as exportBlacklistToExcelModule,
    handleBlacklistActionClick as handleBlacklistActionClickModule,
    showBlacklistDetailModal as showBlacklistDetailModalModule,
    showBlacklistEntryModal as showBlacklistEntryModalModule,
    handleSaveBlacklistEntry as handleSaveBlacklistEntryModule,
    deleteBlacklistEntry as deleteBlacklistEntryModule,
    showBlacklistWarning as showBlacklistWarningModule,
    addBlacklistEntryDB as addBlacklistEntryDBModule,
    getBlacklistEntryDB as getBlacklistEntryDBModule,
    updateBlacklistEntryDB as updateBlacklistEntryDBModule,
    deleteBlacklistEntryDB as deleteBlacklistEntryDBModule,
    getAllBlacklistEntriesDB as getAllBlacklistEntriesDBModule,
    getBlacklistEntriesByInn as getBlacklistEntriesByInnModule,
    isInnBlacklisted as isInnBlacklistedModule,
    checkForBlacklistedInn as checkForBlacklistedInnModule,
} from './js/features/blacklist.js';

// Import/Export System
import {
    setImportExportDependencies,
    clearTemporaryThumbnailsFromContainer as clearTemporaryThumbnailsFromContainerModule,
    importBookmarks as importBookmarksModule,
    importReglaments as importReglamentsModule,
    performForcedBackup as performForcedBackupModule,
    exportAllData as exportAllDataModule,
    initImportExportControls as initImportExportControlsModule,
    _processActualImport as _processActualImportModule,
} from './js/features/import-export.js';

// Screenshots System
import {
    setScreenshotsDependencies,
    showScreenshotViewerModal as showScreenshotViewerModalModule,
    renderScreenshotThumbnails as renderScreenshotThumbnailsModule,
    renderScreenshotList as renderScreenshotListModule,
    handleViewScreenshotClick as handleViewScreenshotClickModule,
    attachScreenshotHandlers as attachScreenshotHandlersModule,
    renderTemporaryThumbnail as renderTemporaryThumbnailModule,
    handleImageFileForStepProcessing as handleImageFileForStepProcessingModule,
    renderScreenshotIcon as renderScreenshotIconModule,
    processImageFile as processImageFileModule,
    attachBookmarkScreenshotHandlers as attachBookmarkScreenshotHandlersModule,
    renderExistingThumbnail as renderExistingThumbnailModule,
} from './js/features/screenshots.js';

// Lightbox System
import {
    setLightboxDependencies,
    showImageAtIndex as showImageAtIndexModule,
    openLightbox as openLightboxModule,
} from './js/features/lightbox.js';

// Tabs Overflow System
import {
    setTabsOverflowDependencies,
    updateVisibleTabs as updateVisibleTabsModule,
    setupTabsOverflow as setupTabsOverflowModule,
    handleMoreTabsBtnClick as handleMoreTabsBtnClickModule,
    clickOutsideTabsHandler as clickOutsideTabsHandlerModule,
    handleTabsResize as handleTabsResizeModule,
} from './js/features/tabs-overflow.js';

// Tabs UI Components
import {
    setTabsDependencies,
    createTabButtonElement as createTabButtonElementModule,
    ensureTabPresent as ensureTabPresentModule,
    setActiveTab as setActiveTabModule,
    initTabClickDelegation as initTabClickDelegationModule,
    applyPanelOrderAndVisibility as applyPanelOrderAndVisibilityModule,
} from './js/components/tabs.js';

// Раннее определение setActiveTab для передачи в setUIInitDependencies и initUI
const setActiveTab = async (tabId, warningJustAccepted = false) =>
    setActiveTabModule(tabId, warningJustAccepted);

// Client Data System
import {
    setClientDataDependencies,
    saveClientData as saveClientDataModule,
    getClientData as getClientDataModule,
    exportClientDataToTxt as exportClientDataToTxtModule,
    loadClientData as loadClientDataModule,
    clearClientData as clearClientDataModule,
    applyClientNotesFontSize as applyClientNotesFontSizeModule,
    createClientNotesInnPreview as createClientNotesInnPreviewModule,
    initClientDataSystem as initClientDataSystemModule,
} from './js/features/client-data.js';

// Step Management System
import {
    setStepManagementDependencies,
    toggleStepCollapse as toggleStepCollapseModule,
    updateStepNumbers as updateStepNumbersModule,
    attachStepDeleteHandler as attachStepDeleteHandlerModule,
} from './js/features/step-management.js';

// App Reload System
import {
    setAppReloadDependencies,
    forceReloadApp as forceReloadAppModule,
    initReloadButton as initReloadButtonModule,
} from './js/features/app-reload.js';

// Employee Extension System
import {
    setEmployeeExtensionDependencies,
    loadEmployeeExtension as loadEmployeeExtensionModule,
    saveEmployeeExtension as saveEmployeeExtensionModule,
    updateExtensionDisplay as updateExtensionDisplayModule,
    setupExtensionFieldListeners as setupExtensionFieldListenersModule,
} from './js/features/employee-extension.js';

import {
    setBackgroundImageDependencies,
    applyCustomBackgroundImage as applyCustomBackgroundImageModule,
    removeCustomBackgroundImage as removeCustomBackgroundImageModule,
    setupBackgroundImageControls as setupBackgroundImageControlsModule,
} from './js/features/background-image.js';

import {
    setLegacyHelpersDependencies,
    ensureSearchIndexIsBuilt as ensureSearchIndexIsBuiltModule,
    loadCategoryInfo as loadCategoryInfoModule,
    saveCategoryInfo as saveCategoryInfoModule,
    getRequiredElementsHelper as getRequiredElementsHelperModule,
    getAllFromIndexedDBWhere as getAllFromIndexedDBWhereModule,
    getOrCreateModal as getOrCreateModalModule,
} from './js/features/legacy-helpers.js';

import { setEscapeHandlerDependencies, addEscapeHandler as addEscapeHandlerModule, removeEscapeHandler as removeEscapeHandlerModule } from './js/ui/escape-handler.js';
import { setOverlayUtilsDependencies, showOverlayForFixedDuration as showOverlayForFixedDurationModule } from './js/ui/overlay-utils.js';
import {
    initUICustomization as initUICustomizationModule,
    setUICustomizationDependencies,
} from './js/ui/ui-customization.js';
import { showNotification as showNotificationModule, ensureNotificationIconlessStyles as ensureNotificationIconlessStylesModule } from './js/features/notification-inline.js';
import { showBookmarkDetailModal as showBookmarkDetailModalModule, setBookmarkDetailDependencies } from './js/features/bookmark-detail.js';
import { initBackgroundStatusHUD } from './js/ui/background-status-hud.js';
import { setOnloadHandlerDependencies, registerOnloadHandler } from './js/app/onload-handler.js';
import { setUISettingsModalInitDependencies, initUISettingsModalHandlers } from './js/ui/ui-settings-modal-init.js';
import { setHeaderButtonsDependencies, initHeaderButtons } from './js/ui/header-buttons.js';
import { setThemeToggleDependencies, initThemeToggle } from './js/ui/theme-toggle.js';
import { setAlgorithmModalControlDependencies, initAlgorithmModalControls } from './js/ui/algorithm-modal-controls.js';
import { setModalOverlayHandlerDependencies, initModalOverlayHandler } from './js/ui/modal-overlay-handler.js';

// UI Modules
import {
    getVisibleModals as getVisibleModalsModule,
    getTopmostModal as getTopmostModalModule,
    hasBlockingModalsOpen as hasBlockingModalsOpenModule,
    toggleModalFullscreen as toggleModalFullscreenModule,
    initFullscreenToggles as initFullscreenTogglesModule,
    initBeforeUnloadHandler as initBeforeUnloadHandlerModule,
    showNoInnModal as showNoInnModalModule,
    UNIFIED_FULLSCREEN_MODAL_CLASSES,
} from './js/ui/modals-manager.js';

import {
    setHotkeysDependencies,
    setupHotkeys as setupHotkeysModule,
    handleNoInnLinkEvent as handleNoInnLinkEventModule,
    handleNoInnLinkClick as handleNoInnLinkClickModule,
    navigateBackWithinApp as navigateBackWithinAppModule,
    handleGlobalHotkey as handleGlobalHotkeyModule,
} from './js/ui/hotkeys-handler.js';

import {
    applyView as applyViewModule,
    applyCurrentView as applyCurrentViewModule,
    initViewToggles as initViewTogglesModule,
    handleViewToggleClick as handleViewToggleClickModule,
    applyDefaultViews as applyDefaultViewsModule,
    toggleActiveSectionView as toggleActiveSectionViewModule,
    loadViewPreferences as loadViewPreferencesModule,
    saveViewPreference as saveViewPreferenceModule,
} from './js/ui/view-manager.js';

// UI Init (extracted from script.js)
import {
    setUIInitDependencies,
    initUI as initUIModule,
    initStepInteractions as initStepInteractionsModule,
    initCollapseAllButtons as initCollapseAllButtonsModule,
    initHotkeysModal as initHotkeysModalModule,
} from './js/ui/init.js';

// Systems Init (extracted from script.js)
import {
    setSystemsInitDependencies,
    initClearDataFunctionality as initClearDataFunctionalityModule,
} from './js/ui/systems-init.js';

// UI Settings Modal (extracted from script.js)
import {
    setUISettingsModalDependencies,
    populateModalControls as populateModalControlsModule,
    handleModalVisibilityToggle as handleModalVisibilityToggleModule,
    getSettingsFromModal as getSettingsFromModalModule,
    updatePreviewSettingsFromModal as updatePreviewSettingsFromModalModule,
    resetUISettingsInModal as resetUISettingsInModalModule,
    createPanelItemElement as createPanelItemElementModule,
} from './js/ui/ui-settings-modal.js';

// UI Settings (extracted from script.js)
import {
    setUISettingsDependencies,
    applyUISettings as applyUISettingsModule,
    applyInitialUISettings as applyInitialUISettingsModule,
    loadUISettings as loadUISettingsModule,
    saveUISettings as saveUISettingsModule,
} from './js/ui/ui-settings.js';

// Preview Settings (extracted from script.js)
import {
    setPreviewSettingsDependencies,
    applyPreviewSettings as applyPreviewSettingsModule,
} from './js/ui/preview-settings.js';

// Color Picker (настройка цветов в модалке UI)
import {
    setColorPickerDependencies,
    setColorPickerStateFromHex as setColorPickerStateFromHexModule,
    initColorPicker as initColorPickerModule,
} from './js/ui/color-picker.js';

// Algorithms Renderer
import {
    setAlgorithmsRendererDependencies,
    showAlgorithmDetail as showAlgorithmDetailModule,
} from './js/components/algorithms-renderer.js';

// ============================================================================
// АЛИАСЫ МОДУЛЕЙ (миграция подсистем)
// ============================================================================
const exportAllData = exportAllDataModule;
const clearTemporaryThumbnailsFromContainer = clearTemporaryThumbnailsFromContainerModule;
const _processActualImport = _processActualImportModule;
const performForcedBackup = performForcedBackupModule;

const appInit = appInitModule;
const loadUserPreferences = loadUserPreferencesModule;
const saveUserPreferences = saveUserPreferencesModule;
const ensureSearchIndexIsBuilt = ensureSearchIndexIsBuiltModule;
const loadCategoryInfo = async () => {
    categoryDisplayInfo = await loadCategoryInfoModule(categoryDisplayInfo);
};
const saveCategoryInfo = async () =>
    saveCategoryInfoModule(categoryDisplayInfo, populateReglamentCategoryDropdowns);
const getRequiredElementsHelper = getRequiredElementsHelperModule;
const getAllFromIndexedDBWhere = getAllFromIndexedDBWhereModule;
const getOrCreateModal = getOrCreateModalModule;
const addEscapeHandler = addEscapeHandlerModule;
const removeEscapeHandler = removeEscapeHandlerModule;
const showOverlayForFixedDuration = showOverlayForFixedDurationModule;
const initUICustomization = initUICustomizationModule;
const showNotification = showNotificationModule;
const ensureNotificationIconlessStyles = ensureNotificationIconlessStylesModule;
const showBookmarkDetailModal = showBookmarkDetailModalModule;

setBackgroundHealthTestsDependencies({
    saveToIndexedDB,
    getFromIndexedDB,
    deleteFromIndexedDB,
    performDBOperation,
});

const setTheme = setThemeModule;
const migrateLegacyThemeVars = migrateLegacyThemeVarsModule;
const applyThemeOverrides = applyThemeOverridesModule;

const loadFromIndexedDB = loadFromIndexedDBModule;
const saveDataToIndexedDB = saveDataToIndexedDBModule;

const updateVisibleTabs = updateVisibleTabsModule;
const setupTabsOverflow = setupTabsOverflowModule;
const handleMoreTabsBtnClick = handleMoreTabsBtnClickModule;
const clickOutsideTabsHandler = clickOutsideTabsHandlerModule;
const handleTabsResize = handleTabsResizeModule;

const showScreenshotViewerModal = showScreenshotViewerModalModule;
const renderScreenshotThumbnails = renderScreenshotThumbnailsModule;
const renderScreenshotList = renderScreenshotListModule;
const attachScreenshotHandlers = attachScreenshotHandlersModule;
const renderTemporaryThumbnail = renderTemporaryThumbnailModule;
const handleImageFileForStepProcessing = handleImageFileForStepProcessingModule;
const renderScreenshotIcon = renderScreenshotIconModule;
const handleViewScreenshotClick = handleViewScreenshotClickModule;

const showImageAtIndex = showImageAtIndexModule;
const openLightbox = openLightboxModule;

const saveClientData = saveClientDataModule;
const getClientData = getClientDataModule;
const exportClientDataToTxt = exportClientDataToTxtModule;
const loadClientData = loadClientDataModule;
const clearClientData = clearClientDataModule;
const applyClientNotesFontSize = applyClientNotesFontSizeModule;
const createClientNotesInnPreview = createClientNotesInnPreviewModule;
const initClientDataSystem = initClientDataSystemModule;

const toggleStepCollapse = toggleStepCollapseModule;
const updateStepNumbers = updateStepNumbersModule;
const attachStepDeleteHandler = attachStepDeleteHandlerModule;

const initStepSorting = initStepSortingModule;
const addEditStep = addEditStepModule;
const extractStepsDataFromEditForm = extractStepsDataFromEditFormModule;
const addNewStep = addNewStepModule;
const saveAlgorithm = saveAlgorithmModule;

const forceReloadApp = forceReloadAppModule;
const initReloadButton = initReloadButtonModule;

const loadEmployeeExtension = loadEmployeeExtensionModule;
const saveEmployeeExtension = saveEmployeeExtensionModule;
const updateExtensionDisplay = updateExtensionDisplayModule;
const setupExtensionFieldListeners = setupExtensionFieldListenersModule;

const createTabButtonElement = createTabButtonElementModule;
const ensureTabPresent = ensureTabPresentModule;
const applyPanelOrderAndVisibility = applyPanelOrderAndVisibilityModule;

const toggleFavorite = toggleFavoriteModule;
const updateFavoriteStatusUI = updateFavoriteStatusUIModule;
const renderFavoritesPage = renderFavoritesPageModule;
const getFavoriteButtonHTML = getFavoriteButtonHTMLModule;
const isFavorite = isFavoriteModule;
const refreshAllFavoritableSectionsUI = refreshAllFavoritableSectionsUIModule;

const exportBlacklistToExcel = exportBlacklistToExcelModule;
const loadBlacklistedClients = loadBlacklistedClientsModule;
const handleBlacklistSearchInput = handleBlacklistSearchInputModule;
const renderBlacklistTable = renderBlacklistTableModule;
const getBlacklistEntriesByInn = getBlacklistEntriesByInnModule;
const handleBlacklistActionClick = handleBlacklistActionClickModule;
const showBlacklistDetailModal = showBlacklistDetailModalModule;
const showBlacklistEntryModal = showBlacklistEntryModalModule;
const handleSaveBlacklistEntry = handleSaveBlacklistEntryModule;
const deleteBlacklistEntry = deleteBlacklistEntryModule;
const addBlacklistEntryDB = addBlacklistEntryDBModule;
const getBlacklistEntryDB = getBlacklistEntryDBModule;
const updateBlacklistEntryDB = updateBlacklistEntryDBModule;
const deleteBlacklistEntryDB = deleteBlacklistEntryDBModule;
const getAllBlacklistEntriesDB = getAllBlacklistEntriesDBModule;
const showBlacklistWarning = showBlacklistWarningModule;
const isInnBlacklisted = isInnBlacklistedModule;
const checkForBlacklistedInn = checkForBlacklistedInnModule;
const sortAndRenderBlacklist = sortAndRenderBlacklistModule;

const createBookmarkElement = createBookmarkElementModule;
const attachBookmarkScreenshotHandlers = attachBookmarkScreenshotHandlersModule;
const renderExistingThumbnail = renderExistingThumbnailModule;
const processImageFile = processImageFileModule;
const loadBookmarks = loadBookmarksModule;
const getAllBookmarks = getAllBookmarksModule;

const loadExtLinks = loadExtLinksModule;
const createExtLinkElement = createExtLinkElementModule;
const renderExtLinks = renderExtLinksModule;

const populateModalControls = populateModalControlsModule;
const applyUISettings = applyUISettingsModule;
const loadUISettings = loadUISettingsModule;
const saveUISettings = saveUISettingsModule;
const calculateSecondaryColor = calculateSecondaryColorModule;
const resetUISettingsInModal = resetUISettingsInModalModule;
const clearAllApplicationData = clearAllApplicationDataModule;
const createPanelItemElement = createPanelItemElementModule;
const applyPreviewSettings = applyPreviewSettingsModule;
const hexToHsl = hexToHslModule;
const hslToHex = hslToHexModule;
const getLuminance = getLuminanceModule;
const adjustHsl = adjustHslModule;
const handleModalVisibilityToggle = handleModalVisibilityToggleModule;
const getSettingsFromModal = getSettingsFromModalModule;
const updatePreviewSettingsFromModal = updatePreviewSettingsFromModalModule;

const deleteAlgorithm = deleteAlgorithmModule;
const linkify = linkifyModule;
const deepEqual = deepEqualModule;
const openAnimatedModal = openAnimatedModalModule;
const closeAnimatedModal = closeAnimatedModalModule;

const getCurrentEditState = getCurrentEditStateModule;
const getCurrentAddState = getCurrentAddStateModule;
const hasChanges = hasChangesModule;
const captureInitialEditState = captureInitialEditStateModule;
const captureInitialAddState = captureInitialAddStateModule;

const applyCustomBackgroundImage = applyCustomBackgroundImageModule;
const removeCustomBackgroundImage = removeCustomBackgroundImageModule;
const setupBackgroundImageControls = setupBackgroundImageControlsModule;

const saveNewAlgorithm = saveNewAlgorithmModule;
const handleNoInnLinkClick = handleNoInnLinkClickModule;
const showNoInnModal = () => showNoInnModalModule(addEscapeHandler, removeEscapeHandler, getVisibleModals);
const handleNoInnLinkEvent = handleNoInnLinkEventModule;
const navigateBackWithinApp = navigateBackWithinAppModule;
const handleGlobalHotkey = handleGlobalHotkeyModule;

// ============================================================================
// ЭКСПОРТ СЕРВИСОВ В WINDOW (для совместимости со старым кодом)
// ============================================================================
// Экспортируем сервисы в window для глобального доступа
window.NotificationService = NotificationService;
window.ExportService = ExportService;

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================
// db теперь в State.db - используем State.db напрямую
// userPreferences теперь в State.userPreferences - используем State.userPreferences напрямую
// Все глобальные переменные теперь в State - используем State.* напрямую

// Все эти переменные теперь в State - используем State.* напрямую
// originalUISettings, State.currentPreviewSettings, State.isUISettingsDirty, State.uiModalState
// State.clientNotesInputHandler, State.clientNotesKeydownHandler, State.clientNotesSaveTimeout
// State.clientNotesCtrlClickHandler, State.clientNotesCtrlKeyDownHandler, State.clientNotesCtrlKeyUpHandler, State.clientNotesBlurHandler
// State.isTabsOverflowCheckRunning, State.tabsOverflowCheckCount, State.updateVisibleTabsRetryCount, State.tabsResizeTimeout
// State.sedoFullscreenEscapeHandler
// State.blacklistEntryModalInstance, State.currentBlacklistWarningOverlay, State.allBlacklistEntriesCache, State.currentBlacklistSearchQuery, State.currentBlacklistSort
// State.isExportOperationInProgress, State.isExpectingExportFileDialog, State.exportDialogInteractionComplete, State.exportWatchdogTimerId, State.exportWindowFocusHandlerInstance
// State.importDialogInteractionComplete
// State.activeEditingUnitElement, State.timerElements, State.initialBookmarkFormState
// State.isExpectingFileDialog, State.windowFocusHandlerInstance
// State.lastKnownInnCounts, State.activeToadNotifications, State.extLinkCategoryInfo

// currentFavoritesCache теперь в State.currentFavoritesCache
// Используем State.currentFavoritesCache напрямую - заменяем все присваивания на State.currentFavoritesCache

// State.googleDocTimestamps и State.timestampUpdateInterval теперь в State

// FIELD_WEIGHTS и DEFAULT_WELCOME_CLIENT_NOTES_TEXT теперь импортируются из constants.js

// ensureNotificationIconlessStyles импортируется из js/features/notification-inline.js

// NotificationService теперь импортируется из services/notification.js
// Дубликат кода NotificationService был удален (было ~440 строк дублирующего кода)
// Весь функционал доступен через импортированный модуль из services/notification.js

// ExportService теперь импортируется из services/export.js
// Оставляем вызов init() для инициализации
ExportService.init();

// UNIFIED_FULLSCREEN_MODAL_CLASSES теперь импортируется из js/ui/modals-manager.js
// Используем импортированную константу напрямую

const algorithmDetailModalConfig = {
    modalId: 'algorithmModal',
    buttonId: 'toggleFullscreenViewBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4', 'sm:p-6', 'md:p-8'],
            innerContainer: ['max-w-7xl', 'rounded-lg', 'shadow-xl'],
            contentArea: ['max-h-[calc(90vh-150px)]', 'p-content'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '#algorithmSteps',
};

const bookmarkModalConfigGlobal = {
    modalId: 'bookmarkModal',
    buttonId: 'toggleFullscreenBookmarkBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-2xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-content', 'overflow-y-auto', 'flex-1', 'min-h-0'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea, 'flex', 'flex-col'],
        },
    },
    innerContainerSelector: '.modal-inner-container',
    contentAreaSelector: '.modal-content-area',
};

const editAlgorithmModalConfig = {
    modalId: 'editModal',
    buttonId: 'toggleFullscreenEditBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-5xl', 'max-h-[95vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-content'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea, 'flex', 'flex-col'],
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '.p-content.overflow-y-auto.flex-1',
};

const addAlgorithmModalConfig = {
    modalId: 'addModal',
    buttonId: 'toggleFullscreenAddBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-content', 'bg-gray-100', 'dark:bg-gray-700'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [
                ...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
                'flex',
                'flex-col',
                'bg-gray-100',
                'dark:bg-gray-700',
            ],
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '.p-content.overflow-y-auto.flex-1',
};

const reglamentDetailModalConfig = {
    modalId: 'reglamentDetailModal',
    buttonId: 'toggleFullscreenReglamentDetailBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['w-[95%]', 'max-w-4xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-6'],
        },
        fullscreen: UNIFIED_FULLSCREEN_MODAL_CLASSES,
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '#reglamentDetailContent',
};

const reglamentModalConfigGlobal = {
    modalId: 'reglamentModal',
    buttonId: 'toggleFullscreenReglamentBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['w-[95%]', 'max-w-5xl', 'h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-6'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: [...UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea, 'flex', 'flex-col'],
        },
    },
    innerContainerSelector: '.modal-inner-container',
    contentAreaSelector: '.modal-content-area',
};

const bookmarkDetailModalConfigGlobal = {
    modalId: 'bookmarkDetailModal',
    buttonId: 'toggleFullscreenBookmarkDetailBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-3xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-6'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '#bookmarkDetailOuterContent',
};

const hotkeysModalConfig = {
    modalId: 'hotkeysModal',
    buttonId: 'toggleFullscreenHotkeysBtn',
    classToggleConfig: {
        normal: {
            modal: ['p-4'],
            innerContainer: ['max-w-3xl', 'max-h-[90vh]', 'rounded-lg', 'shadow-xl'],
            contentArea: ['p-6'],
        },
        fullscreen: {
            modal: UNIFIED_FULLSCREEN_MODAL_CLASSES.modal,
            innerContainer: UNIFIED_FULLSCREEN_MODAL_CLASSES.innerContainer,
            contentArea: UNIFIED_FULLSCREEN_MODAL_CLASSES.contentArea,
        },
    },
    innerContainerSelector: '.bg-white.dark\\:bg-gray-800',
    contentAreaSelector: '.p-6.overflow-y-auto.flex-1',
};

// getVisibleModals теперь импортируется из js/ui/modals-manager.js
const getVisibleModals = getVisibleModalsModule;

const SAVE_BUTTON_SELECTORS =
    'button[type="submit"], #saveAlgorithmBtn, #createAlgorithmBtn, #saveCibLinkBtn, #saveBookmarkBtn, #saveExtLinkBtn';

// hasBlockingModalsOpen, getTopmostModal теперь импортируются из js/ui/modals-manager.js
const hasBlockingModalsOpen = hasBlockingModalsOpenModule;
const getTopmostModal = getTopmostModalModule;

// Escape handlers импортируются из js/ui/escape-handler.js

// debounce и setupClearButton импортируются из js/utils/helpers.js
// debounce уже импортирован напрямую, setupClearButton нужно создать алиас
// Примечание: debounce уже доступен напрямую из импорта, не нужно создавать константу
const setupClearButton = setupClearButtonModule;

// Алиасы для функций модальных окон закладок
const showEditBookmarkModal = showEditBookmarkModalModule;

// Алиас для утилиты буфера обмена
const copyToClipboard = copyToClipboardModule;

// Инициализируем обработчик beforeunload
initBeforeUnloadHandlerModule();

// storeConfigs теперь импортируется из db/stores.js

let algorithms = {
    main: {
        id: 'main',
        title: 'Главный алгоритм работы (значения можно редактировать под ваши нужды)',
        steps: [
            {
                title: 'Приветствие',
                description:
                    'Обозначьте клиенту, куда он дозвонился, представьтесь, поприветствуйте клиента.',
                example:
                    'Техническая поддержка сервиса 1С-Отчетность, меня зовут Сиреневый_Турбобульбулькиватель. Здравствуйте!',
                isCopyable: true,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
            },
            {
                title: 'Уточнение ИНН',
                description:
                    'Запросите ИНН организации для идентификации клиента в системе и дальнейшей работы.',
                example: 'Назовите, пожалуйста, ИНН организации.',
                type: 'inn_step',
                isCopyable: false,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
            },
            {
                title: 'Идентификация проблемы',
                description:
                    'Выясните суть проблемы, задавая уточняющие вопросы. Важно выяснить как можно больше деталей для составления полной картины.',
                example: {
                    type: 'list',
                    intro: 'Примеры вопросов:',
                    items: [
                        'Уточните, пожалуйста, полный текст ошибки.',
                        'При каких действиях возникает ошибка?',
                    ],
                },
                isCopyable: false,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
            },
            {
                title: 'Решение проблемы',
                description:
                    'Четко для себя определите категорию (направление) проблемы и перейдите к соответствующему разделу в помощнике (либо статье на track.astral.ru) с инструкциями по решению.',
                isCopyable: false,
                additionalInfoText: '',
                additionalInfoShowTop: false,
                additionalInfoShowBottom: false,
            },
        ],
    },
    program: [],
    skzi: [],
    lk1c: [],
    webReg: [],
};

// loadingOverlayManager теперь импортируется из js/ui/loading-overlay-manager.js

// Устанавливаем loadingOverlayManager для ExportService
setLoadingOverlayManager(loadingOverlayManager);

// showOverlayForFixedDuration импортируется из js/ui/overlay-utils.js

(function earlyAppSetup() {
    const isReloadingAfterClear = localStorage.getItem('copilotIsReloadingAfterClear') === 'true';
    const appContentEarly = document.getElementById('appContent');

    if (appContentEarly) {
        appContentEarly.classList.add('hidden');
    } else {
        const tempStyle = document.createElement('style');
        tempStyle.id = 'temp-hide-appcontent-style';
        tempStyle.textContent = '#appContent { display: none !important; }';
        document.head.appendChild(tempStyle);
    }

    if (isReloadingAfterClear) {
        console.log('[EarlySetup] Reloading after data clear. Showing overlay and removing flag.');
        if (typeof loadingOverlayManager !== 'undefined' && loadingOverlayManager.createAndShow) {
            loadingOverlayManager.createAndShow();
            loadingOverlayManager.updateProgress(1, 'Инициализация после очистки...');
        }
        try {
            localStorage.removeItem('copilotIsReloadingAfterClear');
            console.log("[EarlySetup] Flag 'copilotIsReloadingAfterClear' removed.");
        } catch (e) {
            console.error("[EarlySetup] Failed to remove 'copilotIsReloadingAfterClear' flag:", e);
        }
    } else {
        console.log('[EarlySetup] Standard load. Attempting to show overlay...');
        if (typeof loadingOverlayManager !== 'undefined' && loadingOverlayManager.createAndShow) {
            loadingOverlayManager.createAndShow();
        }
    }
})();

// appInit теперь импортируется из js/app/app-init.js
// appInit используется напрямую из модуля.

// showAlgorithmDetail теперь импортируется из js/components/algorithms-renderer.js
const showAlgorithmDetail = showAlgorithmDetailModule;

// showReglamentDetail и showReglamentsForCategory теперь импортируются из js/components/reglaments.js
const showReglamentDetail = showReglamentDetailModule;
const showReglamentsForCategory = showReglamentsForCategoryModule;

// debounce теперь импортируется из js/utils/helpers.js
// (уже импортирован выше, используем напрямую)

// Функции инициализации систем - определяем константы для использования в зависимостях
// initSearchSystem импортируется напрямую из js/features/search.js (строка 189)
// initTimerSystem импортируется напрямую из js/features/timer.js (строка 142)
// initSedoTypesSystem импортируется напрямую из js/features/sedo.js (строка 177)
const initCibLinkSystem = initCibLinkSystemModule;
const initReglamentsSystem = initReglamentsSystemModule;
const initBookmarkSystem = initBookmarkSystemModule;
const initExternalLinksSystem = initExternalLinksSystemModule;
const initBlacklistSystem = initBlacklistSystemModule;
const initReloadButton = initReloadButtonModule;

// setActiveTab уже определена выше (после импорта tabs.js)
const initFullscreenToggles = initFullscreenTogglesModule;
const setupHotkeys = setupHotkeysModule;
const initUI = initUIModule;
const initHotkeysModal = initHotkeysModalModule;
const initClearDataFunctionality = initClearDataFunctionalityModule;
const applyInitialUISettings = applyInitialUISettingsModule;

// initViewToggles теперь импортируется из js/ui/view-manager.js
const initViewToggles = initViewTogglesModule;

// initUICustomization импортируется из js/ui/ui-customization.js

// showNotification и showBookmarkDetailModal определены ниже как function declarations
// Благодаря hoisting они доступны здесь, но мы не можем их переопределить
// Поэтому используем их напрямую в зависимостях

// App Init Dependencies
setAppInitDependencies({
    loadingOverlayManager,
    NotificationService,
    initDB,
    loadInitialFavoritesCache,
    handleFavoriteActionClick,
    setActiveTab,
    loadUserPreferences,
    loadCategoryInfo,
    loadFromIndexedDB,
    ensureSearchIndexIsBuilt,
    checkAndBuildIndex,
    setSearchDependencies,
    algorithms,
    showNotification,
    showAlgorithmDetail,
    showBookmarkDetailModal,
    showReglamentDetail,
    showReglamentsForCategory,
    debounce,
    categoryDisplayInfo,
    initSearchSystem,
    initBookmarkSystem,
    initCibLinkSystem,
    initViewToggles,
    initReglamentsSystem,
    initClientDataSystem,
    initExternalLinksSystem,
    initTimerSystem,
    initSedoTypesSystem,
    initBlacklistSystem,
    initFNSCertificateRevocationSystem,
    initAlgorithmsPdfExportSystem,
    initBackgroundHealthTestsSystem,
    initReloadButton,
    initClearDataFunctionality,
    initUICustomization,
    initHotkeysModal,
    setupHotkeys,
    initFullscreenToggles,
    applyInitialUISettings,
    initUI,
});
console.log('[script.js] Зависимости модуля appInit установлены');

// ============================================================================
// УСТАНОВКА ЗАВИСИМОСТЕЙ ДЛЯ МОДУЛЕЙ (ДО window.onload)
// ============================================================================
// Важно: все зависимости должны быть установлены ДО вызова appInit в window.onload

// Data Loader Dependencies - устанавливаются НИЖЕ, после определения DEFAULT_MAIN_ALGORITHM и DEFAULT_OTHER_SECTIONS (см. строку ~1776)

// Ext Links Init Dependencies - устанавливаем ДО вызова initExternalLinksSystem
// ВАЖНО: Используем модули напрямую, так как wrapper функции определены позже
setExtLinksInitDependencies({
    State,
    showAddEditExtLinkModal: showAddEditExtLinkModalModule,
    showOrganizeExtLinkCategoriesModal: showOrganizeExtLinkCategoriesModalModule,
    filterExtLinks: filterExtLinksModule, // Используем модуль, так как wrapper определен позже
    handleExtLinkAction: handleExtLinkActionModule,
    handleViewToggleClick: handleViewToggleClickModule,
    loadExtLinks: loadExtLinksModule, // Используем модуль, так как wrapper определен позже
    populateExtLinkCategoryFilter: populateExtLinkCategoryFilterModule, // Используем модуль, так как wrapper определен позже
    getAllExtLinks,
    renderExtLinks: renderExtLinksModule,
    debounce,
    setupClearButton,
});
console.log('[script.js] Зависимости модуля Ext Links Init установлены');

// Bookmarks Dependencies - устанавливаем ДО вызова initBookmarkSystem
// Используем *Module-импорты для функций, определённых ниже (избегаем TDZ)
setBookmarksDependencies({
    isFavorite,
    getFavoriteButtonHTML,
    showAddBookmarkModal: showAddBookmarkModalModule,
    showBookmarkDetail: showBookmarkDetailModal,
    showOrganizeFoldersModal: showOrganizeFoldersModalModule,
    showNotification,
    debounce,
    setupClearButton,
    loadFoldersList: loadFoldersListModule,
    removeEscapeHandler,
    getVisibleModals,
    addEscapeHandler,
    handleSaveFolderSubmit: handleSaveFolderSubmitModule,
    getAllFromIndex,
    State,
    showEditBookmarkModal,
    deleteBookmark: deleteBookmarkModule,
    showBookmarkDetailModal,
    handleViewBookmarkScreenshots: handleViewBookmarkScreenshotsModule,
});
console.log('[script.js] Зависимости модуля Bookmarks установлены');

// UI Init Dependencies - устанавливаем ДО вызова initUI
setUIInitDependencies({
    State,
    setActiveTab,
    getVisibleModals,
    getTopmostModal,
    toggleModalFullscreen: toggleModalFullscreenModule,
    showNotification,
    renderFavoritesPage,
    updateVisibleTabs,
    showBlacklistWarning,
    hotkeysModalConfig,
});
console.log('[script.js] Зависимости модуля UI Init установлены');

setHeaderButtonsDependencies({ setActiveTab });
initHeaderButtons();

setUISettingsModalInitDependencies({
    State,
    loadUISettings,
    populateModalControls,
    setColorPickerStateFromHex: setColorPickerStateFromHexModule,
    addEscapeHandler,
    openAnimatedModal,
    closeAnimatedModal,
    saveUISettings,
    resetUISettingsInModal,
    updatePreviewSettingsFromModal,
    applyPreviewSettings,
    initColorPicker: initColorPickerModule,
});
console.log('[script.js] Зависимости модуля UI Settings Modal Init установлены');

setOnloadHandlerDependencies({
    NotificationService,
    loadingOverlayManager,
    appInit,
    initGoogleDocSections,
    setupTabsOverflow,
    updateVisibleTabs,
    initUISettingsModalHandlers,
});
console.log('[script.js] Зависимости модуля Onload Handler установлены');

registerOnloadHandler();

// loadUserPreferences и saveUserPreferences теперь импортируются из js/app/user-preferences.js
// loadUserPreferences и saveUserPreferences используются напрямую из модуля.

// initDB теперь импортируется из db/indexeddb.js
// Локальная функция удалена - используем импортированную версию

// ensureSearchIndexIsBuilt, loadCategoryInfo, saveCategoryInfo используются из legacy-helpers.

// Reglaments operations functions теперь импортируются из js/components/reglaments.js
const handleReglamentAction = handleReglamentActionModule;
const populateReglamentCategoryDropdowns = populateReglamentCategoryDropdownsModule;

// ============================================================================
// populateReglamentCategoryDropdowns - MIGRATED to js/components/reglaments.js
// ============================================================================
// populateReglamentCategoryDropdowns - imported from reglaments.js module

// Все функции БД и favorites теперь импортируются из модулей db/
// Обёртки удалены - используем импортированные функции напрямую

// Функции theme используются напрямую из модуля.

// renderAllAlgorithms теперь импортируется из js/components/algorithms.js
const renderAllAlgorithms = renderAllAlgorithmsModule;

// renderAlgorithmCards теперь импортируется из js/components/algorithms.js
const renderAlgorithmCards = renderAlgorithmCardsModule;

// renderMainAlgorithm теперь импортируется из js/components/main-algorithm.js
const renderMainAlgorithm = renderMainAlgorithmModule;

// loadMainAlgoCollapseState и saveMainAlgoCollapseState теперь импортируются из js/components/main-algorithm.js
const loadMainAlgoCollapseState = loadMainAlgoCollapseStateModule;
const saveMainAlgoCollapseState = saveMainAlgoCollapseStateModule;

// loadFromIndexedDB и saveDataToIndexedDB используются напрямую из модуля.

// tabsConfig, allPanelIdsForDefault, defaultPanelOrder теперь импортируются из config.js

// loadUISettings/saveUISettings импортируются из js/ui/ui-settings.js

// ============================================================================
// SEDO SYSTEM - MIGRATED to js/features/sedo.js
// ============================================================================
// All SEDO-related functions are now imported from the sedo module.
// See: js/features/sedo.js

// DIALOG_WATCHDOG_TIMEOUT_NEW теперь импортируется из constants.js (строка 28)

// Функции импорта/экспорта используются напрямую из модуля.

// base64ToBlob теперь импортируется из utils/helpers.js

const importFileInput = document.getElementById('importFileInput');

// Функции импорта/экспорта используются напрямую из модуля.

// showNotification импортируется из js/features/notification-inline.js

const DEFAULT_MAIN_ALGORITHM = JSON.parse(JSON.stringify(algorithms.main));

const DEFAULT_OTHER_SECTIONS = {};
for (const sectionKey in algorithms) {
    if (sectionKey !== 'main' && Object.prototype.hasOwnProperty.call(algorithms, sectionKey)) {
        DEFAULT_OTHER_SECTIONS[sectionKey] = JSON.parse(JSON.stringify(algorithms[sectionKey]));
    }
}

// Data Loader Dependencies - устанавливаем здесь, после определения DEFAULT_MAIN_ALGORITHM и DEFAULT_OTHER_SECTIONS
setDataLoaderDependencies({
    DEFAULT_MAIN_ALGORITHM,
    DEFAULT_OTHER_SECTIONS,
    algorithms,
    renderAllAlgorithms,
    renderMainAlgorithm,
    loadBookmarks: typeof loadBookmarksModule !== 'undefined' ? loadBookmarksModule : loadBookmarks,
    loadReglaments: typeof loadReglamentsModule !== 'undefined' ? loadReglamentsModule : null,
    loadCibLinks: typeof loadCibLinksModule !== 'undefined' ? loadCibLinksModule : null,
    loadExtLinks,
    getClientData,
    showNotification,
});
console.log('[script.js] Зависимости модуля Data Loader установлены');

// Функции Tabs Overflow используются напрямую из модуля.


// saveNewAlgorithm используется напрямую из модуля.

// initUI уже определена выше на строке 967

// setActiveTab уже определена выше на строке 1000

// renderAlgorithmCards теперь импортируется из js/components/algorithms.js

// handleNoInnLinkClick используется напрямую из модуля.

// renderMainAlgorithm, loadMainAlgoCollapseState и saveMainAlgoCollapseState теперь импортируются из js/components/main-algorithm.js

// Функции Screenshots используются напрямую из модуля.

// escapeHtml, normalizeBrokenEntities, decodeBasicEntitiesOnce импортируются из utils/html.js

// showAlgorithmDetail теперь импортируется из js/components/algorithms-renderer.js

// initStepInteractions теперь импортируется из js/ui/init.js
const initStepInteractions = initStepInteractionsModule;

// initCollapseAllButtons теперь импортируется из js/ui/init.js
const initCollapseAllButtons = initCollapseAllButtonsModule;

// Функции работы с видами отображения теперь импортируются из js/ui/view-manager.js
// initViewToggles уже определена выше на строке 973
const loadViewPreferences = loadViewPreferencesModule;
const applyDefaultViews = applyDefaultViewsModule;
const saveViewPreference = saveViewPreferenceModule;
const handleViewToggleClick = handleViewToggleClickModule;

// handleViewToggleClick теперь импортируется из js/ui/view-manager.js
// Старая функция полностью удалена - используется импортированная версия

// applyView теперь импортируется из js/ui/view-manager.js
const applyView = applyViewModule;

// applyCurrentView теперь импортируется из js/ui/view-manager.js
const applyCurrentView = applyCurrentViewModule;

// ============================================================================
// createStepElementHTML - MIGRATED to js/components/algorithms.js
// ============================================================================
// createStepElementHTML - imported from algorithms.js module

// editAlgorithm теперь импортируется из js/components/algorithms-operations.js
const editAlgorithm = editAlgorithmModule;

// ============================================================================
// editAlgorithm - MIGRATED to js/components/algorithms-operations.js
// ============================================================================
// editAlgorithm - imported from algorithms-operations.js module

// Функции algorithms используются напрямую из модулей.

// Функции step-management используются напрямую из модуля.

// ============================================================================
// TIMER SYSTEM - MIGRATED to js/features/timer.js
// ============================================================================
// All timer-related functions are now imported from the timer module.
// See: js/features/timer.js

// ============================================================================
// SEARCH SYSTEM - MIGRATED to js/features/search.js
// ============================================================================
// All search-related functions are now imported from the search module.
// See: js/features/search.js
// Functions migrated:
// - initSearchSystem, performSearch, executeSearch, renderSearchResults
// - handleSearchResultClick, tokenize, sanitizeQuery
// - getAlgorithmText, getTextForItem
// - addToSearchIndex, removeFromSearchIndex, updateSearchIndex, updateSearchIndexForItem
// - checkAndBuildIndex, buildInitialSearchIndex, cleanAndRebuildSearchIndex
// - debouncedSearch, getCachedResults, cacheResults
// - expandQueryWithSynonyms, searchWithRegex, debug_checkIndex
// ============================================================================

/* LEGACY SEARCH CODE REMOVED - See js/features/search.js */


// Функции Client Data используются напрямую из модуля.

// Функции theme используются напрямую из модуля.

document.addEventListener('DOMContentLoaded', migrateLegacyThemeVars, { once: true });

setThemeToggleDependencies({
    State,
    DEFAULT_UI_SETTINGS,
    setTheme,
    showNotification,
    saveUserPreferences,
    getSettingsFromModal,
    deepEqual,
});
initThemeToggle();

// Функции tabs используются напрямую из модуля.

// Функции bookmarks используются напрямую из модуля.

// initBookmarkSystem уже определена выше на строке 961

// Bookmarks modal functions теперь импортируются из js/features/bookmarks-modal.js
const ensureBookmarkModal = ensureBookmarkModalModule;
const showAddBookmarkModal = showAddBookmarkModalModule;

// Bookmarks operations functions теперь импортируются из js/components/bookmarks.js
const showOrganizeFoldersModal = showOrganizeFoldersModalModule;
const filterBookmarks = filterBookmarksModule;
const populateBookmarkFolders = populateBookmarkFoldersModule;
const loadFoldersList = loadFoldersListModule;
const handleSaveFolderSubmit = handleSaveFolderSubmitModule;

// getAllFromIndex импортируется напрямую из js/db/indexeddb.js (строка 88)
// Используем напрямую

// Функции Screenshots используются напрямую из модуля.

// Bookmarks form submit function теперь импортируется из js/features/bookmarks-form.js
const handleBookmarkFormSubmit = handleBookmarkFormSubmitModule;

// loadBookmarks и getAllBookmarks используются напрямую из модуля.

// initExternalLinksSystem уже определена выше на строке 962

// loadExtLinks используется напрямую из модуля.

// ============================================================================
// createExtLinkElement - MIGRATED to js/components/ext-links.js
// ============================================================================
// createExtLinkElement используется напрямую из модуля.

// createExtLinkElement_OLD - migrated to js/components/ext-links.js

// renderExtLinks используется напрямую из модуля.

// Ext Links functions теперь импортируются из js/features/ext-links-form.js и ext-links-modal.js
const handleExtLinkFormSubmit = handleExtLinkFormSubmitModule;
const ensureExtLinkModal = ensureExtLinkModalModule;
const showAddExtLinkModal = showAddExtLinkModalModule;
const showEditExtLinkModal = showEditExtLinkModalModule;
const showAddEditExtLinkModal = showAddEditExtLinkModalModule;

// Ext Links Categories functions теперь импортируются из js/features/ext-links-categories.js
const showOrganizeExtLinkCategoriesModal = showOrganizeExtLinkCategoriesModalModule;
const handleSaveExtLinkCategorySubmit = handleSaveExtLinkCategorySubmitModule;
const handleDeleteExtLinkCategoryClick = handleDeleteExtLinkCategoryClickModule;
const populateExtLinkCategoryFilter = populateExtLinkCategoryFilterModule;

// Ext Links Actions functions теперь импортируются из js/features/ext-links-actions.js
const filterExtLinks = filterExtLinksModule;
const handleExtLinkAction = handleExtLinkActionModule;


// populateModalControls используется напрямую из модуля.

// ============================================================================
// populateModalControls - MIGRATED to js/ui/ui-settings-modal.js
// ============================================================================
// populateModalControls - imported from ui-settings-modal.js module

if (typeof applyUISettings === 'undefined') {
    window.applyUISettings = async () => {
        console.warn('applyUISettings (ЗАГЛУШКА) вызвана. Реальная функция не найдена.');

        if (typeof DEFAULT_UI_SETTINGS === 'object' && typeof applyPreviewSettings === 'function') {
            try {
                await applyPreviewSettings(DEFAULT_UI_SETTINGS);
                console.log('applyUISettings (ЗАГЛУШКА): Применены настройки UI по умолчанию.');
            } catch (e) {
                console.error(
                    'applyUISettings (ЗАГЛУШКА): Ошибка применения настроек по умолчанию.',
                    e,
                );
            }
        }
        return Promise.resolve();
    };
}

// applyUISettings используется напрямую из модуля.

// calculateSecondaryColor используется напрямую из модуля.

if (typeof loadUISettings === 'undefined') {
    window.loadUISettings = () => console.log('loadUISettings called');
}
if (typeof saveUISettings === 'undefined') {
    window.saveUISettings = () => console.log('saveUISettings called');
}
if (typeof applyUISettings === 'undefined') {
    window.applyUISettings = () => console.log('applyUISettings called');
}
if (typeof resetUISettings === 'undefined') {
    window.resetUISettings = () => console.log('resetUISettings called');
}
if (typeof showNotification === 'undefined') {
    window.showNotification = (msg) => console.log('Notification:', msg);
}

// resetUISettingsInModal используется напрямую из модуля.

// ============================================================================
// resetUISettingsInModal - MIGRATED to js/ui/ui-settings-modal.js
// ============================================================================
// resetUISettingsInModal - imported from ui-settings-modal.js module

// applyInitialUISettings уже определена выше на строке 970

// initClearDataFunctionality уже определена выше на строке 969

// clearAllApplicationData используется напрямую из модуля.

// createPanelItemElement используется напрямую из модуля.

// ============================================================================
// createPanelItemElement - MIGRATED to js/ui/ui-settings-modal.js
// ============================================================================
// createPanelItemElement - imported from ui-settings-modal.js module

let _themeMql = null;

// applyPreviewSettings используется напрямую из модуля.

// User Preferences Dependencies - устанавливаем ДО использования в appInit
setUserPreferencesDependencies({
    State,
    DEFAULT_UI_SETTINGS,
    defaultPanelOrder,
    tabsConfig,
    showNotification,
});
console.log('[script.js] Зависимости модуля User Preferences установлены');

// Preview Settings Dependencies
setPreviewSettingsDependencies({
    DEFAULT_UI_SETTINGS,
    calculateSecondaryColor: calculateSecondaryColorModule,
    hexToHsl: hexToHslModule,
    hslToHex: hslToHexModule,
    adjustHsl: adjustHslModule,
    setTheme: typeof setThemeModule !== 'undefined' ? setThemeModule : setTheme,
});
console.log('[script.js] Зависимости модуля Preview Settings установлены');

// UI Settings Modal Dependencies
// defaultPanelVisibility вычисляется динамически, поэтому передаем null и используем fallback в модуле
setUISettingsModalDependencies({
    State,
    DEFAULT_UI_SETTINGS,
    tabsConfig,
    defaultPanelOrder,
    defaultPanelVisibility: null, // Вычисляется динамически в script.js, в модуле используется fallback
    showNotification,
    deleteFromIndexedDB,
    removeCustomBackgroundImage: removeCustomBackgroundImageModule,
    applyPreviewSettings: applyPreviewSettingsModule,
    setColorPickerStateFromHex: setColorPickerStateFromHexModule,
    handleModalVisibilityToggle: handleModalVisibilityToggleModule,
});
console.log('[script.js] Зависимости модуля UI Settings Modal установлены');

// UI Settings Dependencies
// defaultPanelVisibility вычисляется динамически на основе defaultPanelOrder
const defaultPanelVisibility = defaultPanelOrder.map(
    (id) => !(id === 'sedoTypes' || id === 'blacklistedClients'),
);

setUISettingsDependencies({
    State,
    DEFAULT_UI_SETTINGS,
    tabsConfig,
    defaultPanelOrder,
    defaultPanelVisibility,
    applyPreviewSettings: applyPreviewSettingsModule,
    showNotification,
    loadUserPreferences: typeof loadUserPreferencesModule !== 'undefined' ? loadUserPreferencesModule : loadUserPreferences,
    applyPanelOrderAndVisibility: applyPanelOrderAndVisibilityModule,
    ensureTabPresent: typeof ensureTabPresentModule !== 'undefined' ? ensureTabPresentModule : ensureTabPresent,
    setupTabsOverflow: typeof setupTabsOverflowModule !== 'undefined' ? setupTabsOverflowModule : setupTabsOverflow,
    updateVisibleTabs: typeof updateVisibleTabsModule !== 'undefined' ? updateVisibleTabsModule : updateVisibleTabs,
    getSettingsFromModal: getSettingsFromModalModule,
});
console.log('[script.js] Зависимости модуля UI Settings установлены');

// hexToHsl и hslToHex используются напрямую из модуля.

// Color Picker Dependencies (после hexToHsl/hslToHex)
setColorPickerDependencies({
    State,
    applyPreviewSettings: applyPreviewSettingsModule,
    updatePreviewSettingsFromModal: updatePreviewSettingsFromModalModule,
    hexToHsl,
    hslToHex,
    DEFAULT_UI_SETTINGS,
});
console.log('[script.js] Зависимости модуля Color Picker установлены');

// getLuminance и adjustHsl используются напрямую из модуля.

// applyPanelOrderAndVisibility, handleModalVisibilityToggle, getSettingsFromModal, updatePreviewSettingsFromModal используются напрямую из модулей.

// ============================================================================
// handleModalVisibilityToggle, getSettingsFromModal, updatePreviewSettingsFromModal - MIGRATED to js/ui/ui-settings-modal.js
// ============================================================================
// Эти функции импортированы из ui-settings-modal.js module

// deleteAlgorithm используется напрямую из модуля.

// linkify используется напрямую из модуля.
setAlgorithmModalControlDependencies({
    deleteAlgorithm,
    showNotification,
    editAlgorithm,
    ExportService,
    closeAnimatedModal,
});
initAlgorithmModalControls();

setModalOverlayHandlerDependencies({
    getVisibleModals,
    getTopmostModal,
    requestCloseModal: typeof requestCloseModal !== 'undefined' ? requestCloseModal : null,
    removeEscapeHandler,
});
initModalOverlayHandler();

// initFullscreenToggles уже определена выше на строке 965
// Вызываем её с конфигами модальных окон при необходимости
// (используется напрямую из модуля, обертка не нужна)

// toggleModalFullscreen теперь импортируется из js/ui/modals-manager.js
const toggleModalFullscreen = toggleModalFullscreenModule;

// getAllExtLinks - imported from ext-links.js module

// getAllFromIndexedDBWhere используется из legacy-helpers.

// debounce - imported from helpers.js module

// Функции App Reload используются напрямую из модуля.

// Функции Algorithm Editing State используются напрямую из модуля.

// showNoInnModal используется напрямую из модуля.

// ============================================================================
// showNoInnModal - MIGRATED to js/ui/modals-manager.js
// ============================================================================
// showNoInnModal - imported from modals-manager.js module

// Функции Employee Extension используются напрямую из модуля.

// setupHotkeys уже определена выше на строке 966

// toggleActiveSectionView теперь импортируется из js/ui/view-manager.js
const toggleActiveSectionView = toggleActiveSectionViewModule;

// handleNoInnLinkEvent, navigateBackWithinApp, handleGlobalHotkey используются напрямую из модулей.

// ============================================================================
// handleGlobalHotkey - MIGRATED to js/ui/hotkeys-handler.js
// ============================================================================
// Оригинальная функция handleGlobalHotkey была здесь, но теперь мигрирована в модуль
// Старая версия функции handleGlobalHotkey была удалена после миграции в js/ui/hotkeys-handler.js

// showBookmarkDetailModal импортируется из js/features/bookmark-detail.js

// getCurrentBookmarkFormState - imported from js/components/bookmarks.js

// initHotkeysModal уже определена выше на строке 968

// Функции Lightbox и Screenshots используются напрямую из модулей.

// Bookmarks DOM operations теперь импортируются из js/features/bookmarks-dom.js
const addBookmarkToDOM = addBookmarkToDOMModule;
const updateBookmarkInDOM = updateBookmarkInDOMModule;
const removeBookmarkFromDOM = removeBookmarkFromDOMModule;

// Функции step-management используются напрямую из модуля.

// deepEqual и modal utils используются напрямую из модулей.

// showAddModal теперь импортируется из js/components/algorithms-operations.js
const showAddModal = showAddModalModule;

// ============================================================================
// showAddModal - MIGRATED to js/components/algorithms-operations.js
// ============================================================================
// showAddModal - imported from algorithms-operations.js module

// ============================================================================
// BLACKLIST SYSTEM - MIGRATED to js/features/blacklist.js
// ============================================================================
// All blacklist-related functions are now imported from the blacklist module.
// See: js/features/blacklist.js
// Функции черного списка используются напрямую из модуля.


// Функции Client Data используются напрямую из модуля.

// normalizeAlgorithmSteps - imported from algorithms.js module

// ============================================================================
// FAVORITES SYSTEM - MIGRATED to js/features/favorites.js
// ============================================================================
// All favorites-related functions are now imported from the favorites module.
// See: js/features/favorites.js
// Functions migrated:
// - toggleFavorite, updateFavoriteStatusUI, renderFavoritesPage
// - getFavoriteButtonHTML, handleFavoriteContainerClick, handleFavoriteActionClick
// - isFavorite, refreshAllFavoritableSectionsUI, initFavoritesSystem

// Функции избранного и черного списка используются напрямую из модулей.

// GOOGLE DOCS INTEGRATION - MIGRATED to js/features/google-docs.js
// ============================================================================
// All Google Docs functions are now imported from the google-docs module.
// See: js/features/google-docs.js

// background-image функции используются напрямую из модуля.

// ============================================================================
// PDF ATTACHMENT SYSTEM - MIGRATED to js/features/pdf-attachments.js
// ============================================================================
// All PDF-related functions are now imported from the pdf-attachments module.
// See: js/features/pdf-attachments.js

const backgroundStatusHUD = initBackgroundStatusHUD();
window.BackgroundStatusHUD = backgroundStatusHUD;
setOnloadHandlerDependencies({ backgroundStatusHUD });

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ЗАВИСИМОСТЕЙ МОДУЛЕЙ
// ============================================================================
// Устанавливаем зависимости для модулей, которые их требуют

// Алиас: в приложении используется showBookmarkDetailModal для просмотра закладки
const showBookmarkDetail = showBookmarkDetailModal;
const deleteBookmark = deleteBookmarkModule;
const handleViewBookmarkScreenshots = handleViewBookmarkScreenshotsModule;

// Bookmarks System Dependencies
setBookmarksDependencies({
    isFavorite,
    getFavoriteButtonHTML,
    showAddBookmarkModal,
    showBookmarkDetail,
    showOrganizeFoldersModal,
    showNotification,
    debounce,
    setupClearButton,
    loadFoldersList,
    removeEscapeHandler,
    getVisibleModals,
    addEscapeHandler,
    handleSaveFolderSubmit,
    getAllFromIndex,
    State,
    showEditBookmarkModal,
    deleteBookmark,
    showBookmarkDetailModal,
    handleViewBookmarkScreenshots,
    NotificationService,
    showScreenshotViewerModal,
});
console.log('[script.js] Зависимости модуля Bookmarks установлены');

// Bookmarks Modal Dependencies
setBookmarksModalDependencies({
    bookmarkModalConfigGlobal,
    State,
    getCurrentBookmarkFormState,
    deepEqual,
    showNotification,
    getVisibleModals,
    addEscapeHandler,
    removeEscapeHandler,
    toggleModalFullscreen,
    clearTemporaryThumbnailsFromContainer,
    attachBookmarkScreenshotHandlers,
    attachBookmarkPdfHandlers,
    handleBookmarkFormSubmit: handleBookmarkFormSubmitModule,
    populateBookmarkFolders,
    getFromIndexedDB,
    renderExistingThumbnail,
});
console.log('[script.js] Зависимости модуля Bookmarks Modal установлены');

// Bookmarks Delete Dependencies
setBookmarksDeleteDependencies({
    State,
    getFromIndexedDB,
    showNotification,
    updateSearchIndex,
    removeBookmarkFromDOM: removeBookmarkFromDOMModule,
    loadBookmarks,
    removeFromFavoritesDB,
    updateFavoriteStatusUI,
    renderFavoritesPage,
});
console.log('[script.js] Зависимости модуля Bookmarks Delete установлены');

// Bookmarks Form Submit Dependencies
setBookmarksFormDependencies({
    State,
    ARCHIVE_FOLDER_ID,
    showNotification,
    addPdfRecords,
    updateSearchIndex,
    loadBookmarks,
    getVisibleModals,
});
console.log('[script.js] Зависимости модуля Bookmarks Form установлены');

// Bookmarks DOM Operations Dependencies
setBookmarksDomDependencies({
    createBookmarkElement: createBookmarkElementModule,
    applyCurrentView,
    removeFromFavoritesDB,
    updateFavoriteStatusUI,
    renderFavoritesPage,
    State,
    SECTION_GRID_COLS,
    CARD_CONTAINER_CLASSES,
});
console.log('[script.js] Зависимости модуля Bookmarks DOM установлены');

// Ext Links Form Submit Dependencies
setExtLinksFormDependencies({
    State,
    showNotification,
    ensureExtLinkModal: ensureExtLinkModalModule,
    getFromIndexedDB,
    saveToIndexedDB,
    updateSearchIndex,
    getAllExtLinks,
    renderExtLinks: renderExtLinksModule,
    getVisibleModals,
    removeEscapeHandler,
});
console.log('[script.js] Зависимости модуля Ext Links Form установлены');

// Ext Links Modal Dependencies
setExtLinksModalDependencies({
    State,
    showNotification,
    getFromIndexedDB,
    getAllFromIndexedDB,
    removeEscapeHandler,
    addEscapeHandler,
    getVisibleModals,
    handleExtLinkFormSubmit: handleExtLinkFormSubmitModule,
});
console.log('[script.js] Зависимости модуля Ext Links Modal установлены');

// Ext Links Categories Dependencies
setExtLinksCategoriesDependencies({
    State,
    showNotification,
    getFromIndexedDB,
    getAllFromIndexedDB,
    getAllFromIndex,
    saveToIndexedDB,
    deleteFromIndexedDB,
    updateSearchIndex,
    removeEscapeHandler,
    addEscapeHandler,
    getVisibleModals,
    renderExtLinks: renderExtLinksModule,
    getAllExtLinks,
    populateExtLinkCategoryFilter: populateExtLinkCategoryFilterModule,
});
console.log('[script.js] Зависимости модуля Ext Links Categories установлены');

// Ext Links Actions Dependencies
setExtLinksActionsDependencies({
    State,
    showNotification,
    getAllExtLinks,
    renderExtLinks: renderExtLinksModule,
    showEditExtLinkModal: showEditExtLinkModalModule,
    deleteFromIndexedDB,
    updateSearchIndex,
    escapeHtml,
});
console.log('[script.js] Зависимости модуля Ext Links Actions установлены');

// Ext Links Init Dependencies уже установлены выше перед window.onload

// Favorites System Dependencies
setFavoritesDependencies({
    showNotification,
    setActiveTab,
    algorithms,
    showAlgorithmDetail,
    showBookmarkDetailModal,
    showReglamentDetail,
    showReglamentsForCategory,
    copyToClipboard,
    filterBookmarks,
    applyCurrentView,
    loadingOverlayManager,
    renderAllAlgorithms,
    loadBookmarks,
    loadExtLinks,
    renderReglamentCategoriesModule,
});
console.log('[script.js] Зависимости модуля Favorites установлены');

/**
 * Возвращает объект с элементами по переданным id или null, если хотя бы один не найден.
 * @param {string[]} ids - массив id элементов
 * @returns {{ [key: string]: HTMLElement } | null}
 */
// getRequiredElementsHelper используется из legacy-helpers.

// CIB Links System Dependencies
setCibLinksDependencies({
    showNotification,
    debounce,
    filterLinks: filterLinksModule,
    setupClearButton,
    copyToClipboard,
    handleViewToggleClick,
    applyCurrentView,
    applyView,
    updateSearchIndex,
    getVisibleModals,
    addEscapeHandler,
    removeEscapeHandler,
    getRequiredElements: getRequiredElementsHelper,
    DEFAULT_CIB_LINKS,
});
console.log('[script.js] Зависимости модуля CIB Links установлены');

// Blacklist System Dependencies
setBlacklistDependencies({
    showNotification,
    debounce,
    escapeHtml,
    escapeRegExp,
    getVisibleModals,
    setActiveTab,
    updateSearchIndex,
    NotificationService,
    XLSX: window.XLSX,
});
console.log('[script.js] Зависимости модуля Blacklist установлены');

// Import/Export System Dependencies
setImportExportDependencies({
    NotificationService,
    loadingOverlayManager,
    showNotification,
    setActiveTab,
    setTheme,
    renderAllAlgorithms,
    loadBookmarks,
    loadExtLinks,
    loadCibLinks: loadCibLinksModule,
    renderReglamentCategoriesModule,
    showReglamentsForCategory,
    initSearchSystem,
    buildInitialSearchIndex,
    updateSearchIndex,
    loadSedoData,
    applyPreviewSettings,
    applyThemeOverrides,
    importFileInput,
});
console.log('[script.js] Зависимости модуля Import/Export установлены');
initImportExportControlsModule();

// Screenshots System Dependencies
setScreenshotsDependencies({
    showNotification,
    openLightbox,
    getVisibleModals,
    removeEscapeHandler,
    algorithms,
});
console.log('[script.js] Зависимости модуля Screenshots установлены');

// Lightbox System Dependencies
setLightboxDependencies({
    getVisibleModals,
});
console.log('[script.js] Зависимости модуля Lightbox установлены');

// Tabs Overflow System Dependencies
setTabsOverflowDependencies({
    setActiveTab,
});
console.log('[script.js] Зависимости модуля Tabs Overflow установлены');

// Tabs UI Dependencies
setTabsDependencies({
    setActiveTab: setActiveTabModule,
    showBlacklistWarning: typeof showBlacklistWarningModule !== 'undefined' ? showBlacklistWarningModule : showBlacklistWarning,
    renderFavoritesPage: typeof renderFavoritesPageModule !== 'undefined' ? renderFavoritesPageModule : renderFavoritesPage,
    updateVisibleTabs: typeof updateVisibleTabsModule !== 'undefined' ? updateVisibleTabsModule : updateVisibleTabs,
    getVisibleModals: typeof getVisibleModalsModule !== 'undefined' ? getVisibleModalsModule : getVisibleModals,
});
console.log('[script.js] Зависимости модуля Tabs UI установлены');
initTabClickDelegationModule();

// UI Init Dependencies
setUIInitDependencies({
    State,
    setActiveTab,
    getVisibleModals,
    getTopmostModal,
    toggleModalFullscreen: toggleModalFullscreenModule,
    showNotification,
    renderFavoritesPage,
    updateVisibleTabs,
    showBlacklistWarning,
    hotkeysModalConfig,
});
console.log('[script.js] Зависимости модуля UI Init установлены');

// Systems Init Dependencies
setSystemsInitDependencies({
    State,
    DB_NAME,
    TIMER_STATE_KEY,
    BLACKLIST_WARNING_ACCEPTED_KEY,
    USER_PREFERENCES_KEY,
    CATEGORY_INFO_KEY,
    SEDO_CONFIG_KEY,
    addEscapeHandler,
    removeEscapeHandler,
    getVisibleModals,
    clearAllApplicationData,
    exportAllData,
    loadingOverlayManager,
    NotificationService,
    showNotification,
});
console.log('[script.js] Зависимости модуля Systems Init установлены');

// Hotkeys Handler Dependencies
setHotkeysDependencies({
    showNoInnModal,
    showNotification,
    handleGlobalHotkey: handleGlobalHotkeyModule, // Теперь импортируется из модуля
    forceReloadApp,
    // Dependencies for handleGlobalHotkey
    State,
    CLIENT_NOTES_MAX_FONT_SIZE,
    CLIENT_NOTES_MIN_FONT_SIZE,
    CLIENT_NOTES_FONT_SIZE_STEP,
    applyClientNotesFontSize: applyClientNotesFontSizeModule,
    saveUserPreferences,
    getTopmostModal: getTopmostModalModule,
    getVisibleModals: getVisibleModalsModule,
    requestCloseModal: typeof requestCloseModal !== 'undefined' ? requestCloseModal : null,
    showAddModal: showAddModalModule,
    showAddEditCibLinkModal: showAddEditCibLinkModalModule,
    showAddExtLinkModal: showAddExtLinkModalModule,
    showAddReglamentModal: showAddReglamentModalModule,
    showAddBookmarkModal: showAddBookmarkModalModule,
    setActiveTab,
    exportAllData: exportAllDataModule,
    exportClientDataToTxt: exportClientDataToTxtModule,
    clearClientData: clearClientDataModule,
    toggleActiveSectionView: toggleActiveSectionViewModule,
});
console.log('[script.js] Зависимости модуля Hotkeys Handler установлены');

// UI Settings Modal Dependencies (applyPreviewSettings определена ниже, но доступна благодаря hoisting)
// setUISettingsModalDependencies вызывается после определения applyPreviewSettings - см. после функции applyPreviewSettings

// Algorithm Editing Dependencies
setAlgorithmsDependencies({
    algorithms,
    isFavorite,
    getFavoriteButtonHTML,
    showAlgorithmDetail,
    copyToClipboard,
    applyCurrentView,
    loadMainAlgoCollapseState,
    saveMainAlgoCollapseState,
    showNotification,
    attachStepDeleteHandler,
    attachScreenshotHandlers,
    updateStepNumbers,
    toggleStepCollapse,
    Sortable: typeof Sortable !== 'undefined' ? Sortable : null,
});
console.log('[script.js] Зависимости модуля Algorithm Editing установлены');

setAlgorithmsPdfExportDependencies({
    algorithms,
    ExportService,
    showNotification,
});
console.log('[script.js] Зависимости модуля Algorithms PDF Export установлены');

// Algorithms Operations Dependencies
setAlgorithmsOperationsDependencies({
    algorithms,
    showNotification,
    createStepElementHTML,
    formatExampleForTextarea,
    toggleStepCollapse,
    attachStepDeleteHandler,
    updateStepNumbers,
    initStepSorting: initStepSortingModule,
    captureInitialEditState: captureInitialEditStateModule,
    captureInitialAddState: captureInitialAddStateModule,
    openAnimatedModal: openAnimatedModalModule,
    attachScreenshotHandlers: attachScreenshotHandlersModule,
    renderExistingThumbnail: renderExistingThumbnailModule,
    addNewStep: addNewStepModule,
    getSectionName,
});
console.log('[script.js] Зависимости модуля Algorithms Operations установлены');

// Algorithms Save Dependencies
setAlgorithmsSaveDependencies({
    State,
    algorithms,
    extractStepsDataFromEditForm: extractStepsDataFromEditFormModule,
    showNotification,
    updateSearchIndex,
    renderAlgorithmCards: renderAlgorithmCardsModule,
    renderMainAlgorithm: renderMainAlgorithmModule,
    clearTemporaryThumbnailsFromContainer: clearTemporaryThumbnailsFromContainerModule,
    getVisibleModals: getVisibleModalsModule,
    addPdfRecords,
    resetInitialAddState,
    resetInitialEditState,
    getSectionName,
});
console.log('[script.js] Зависимости модуля Algorithms Save установлены');

/**
 * Возвращает существующий модальный элемент по id или создаёт новый (div с id, классом, HTML и опциональной настройкой).
 * @param {string} modalId - id элемента
 * @param {string} modalClassName - классы
 * @param {string} modalHTML - innerHTML
 * @param {function(HTMLElement)=} setupCallback - вызывается после создания с элементом модалки
 * @returns {HTMLElement}
 */
// getOrCreateModal используется из legacy-helpers.

// Reglaments System Dependencies
setReglamentsDependencies({
    State,
    categoryDisplayInfo,
    getFromIndexedDB,
    saveToIndexedDB,
    deleteFromIndexedDB,
    getAllFromIndexedDB,
    showNotification,
    applyCurrentView,
    isFavorite,
    getFavoriteButtonHTML,
    updateSearchIndex,
    getOrCreateModal,
    removeEscapeHandler,
    addEscapeHandler,
    toggleModalFullscreen,
    getVisibleModals,
    ExportService,
    reglamentDetailModalConfig,
    reglamentModalConfigGlobal,
    handleViewToggleClick,
});
console.log('[script.js] Зависимости модуля Reglaments установлены');

setBookmarkDetailDependencies({
    getVisibleModals,
    getFromIndexedDB,
    showNotification,
    getAllFromIndex,
    renderScreenshotThumbnails,
    openLightbox,
    isFavorite,
    getFavoriteButtonHTML,
    showEditBookmarkModal,
    toggleModalFullscreen,
    bookmarkDetailModalConfig: bookmarkDetailModalConfigGlobal,
    wireBookmarkDetailModalCloseHandler: null,
    renderPdfAttachmentsSection,
});
console.log('[script.js] Зависимости модуля Bookmark Detail установлены');

// Clipboard System Dependencies
setClipboardDependencies({
    NotificationService,
    showNotification,
});
console.log('[script.js] Зависимости модуля Clipboard установлены');

// Client Data System Dependencies
setClientDataDependencies({
    showNotification,
    NotificationService,
    updateSearchIndex,
    debounce,
    checkForBlacklistedInn,
    copyToClipboard,
    getVisibleModals,
    escapeHtml,
    DEFAULT_MAIN_ALGORITHM,
    algorithms,
    saveUserPreferences,
});
console.log('[script.js] Зависимости модуля Client Data установлены');

// Modal System Dependencies
setModalDependencies({
    addEscapeHandler,
    removeEscapeHandler,
});
console.log('[script.js] Зависимости модуля Modal установлены');

setEscapeHandlerDependencies({
    getVisibleModals,
    getTopmostModal,
});
console.log('[script.js] Зависимости модуля Escape Handler установлены');

setOverlayUtilsDependencies({
    loadingOverlayManager,
});
console.log('[script.js] Зависимости модуля Overlay Utils установлены');

// Step Management System Dependencies
setStepManagementDependencies({
    showNotification,
});
console.log('[script.js] Зависимости модуля Step Management установлены');

// App Reload System Dependencies
setAppReloadDependencies({
    showNotification,
});
console.log('[script.js] Зависимости модуля App Reload установлены');

setLegacyHelpersDependencies({
    checkAndBuildIndex,
    getFromIndexedDB,
    saveToIndexedDB,
    CATEGORY_INFO_KEY,
    showNotification,
    getAllFromIndex,
});
console.log('[script.js] Зависимости модуля Legacy Helpers установлены');

// Employee Extension System Dependencies
setEmployeeExtensionDependencies({
    showNotification,
    saveUserPreferences,
});
console.log('[script.js] Зависимости модуля Employee Extension установлены');

// Background Image System Dependencies
setBackgroundImageDependencies({
    showNotification,
    saveToIndexedDB,
    deleteFromIndexedDB,
    processImageFile,
});
console.log('[script.js] Зависимости модуля Background Image установлены');

setUICustomizationDependencies({
    getFromIndexedDB,
    applyCustomBackgroundImage,
    setupBackgroundImageControls,
    showNotification,
});
console.log('[script.js] Зависимости модуля UI Customization установлены');

// Main Algorithm Dependencies
setMainAlgorithmDependencies({
    algorithms,
    copyToClipboard,
    DEFAULT_MAIN_ALGORITHM,
});
console.log('[script.js] Зависимости модуля Main Algorithm установлены');

// Algorithms Renderer Dependencies
setAlgorithmsRendererDependencies({
    algorithms,
    isFavorite,
    getFavoriteButtonHTML,
    showNotification,
    ExportService,
    renderScreenshotIcon: renderScreenshotIconModule,
    handleViewScreenshotClick: handleViewScreenshotClickModule,
    openAnimatedModal: openAnimatedModalModule,
});
console.log('[script.js] Зависимости модуля Algorithms Renderer установлены');

// Data Loader Dependencies уже установлены выше перед window.onload

// User Preferences Dependencies уже установлены выше на строке 2157

// Data Clear Dependencies
setDataClearDependencies({
    State,
});
console.log('[script.js] Зависимости модуля Data Clear установлены');

// ============================================================================
// ЭКСПОРТ ФУНКЦИЙ В WINDOW (для совместимости с модулями и старым кодом)
// ============================================================================
// Экспортируем функции в window для глобального доступа
// Это необходимо, так как script.js теперь ES-модуль и функции не попадают в глобальную область автоматически
if (typeof showNotification === 'function') window.showNotification = showNotification;
if (typeof algorithms !== 'undefined') window.algorithms = algorithms;
if (typeof isFavorite === 'function') window.isFavorite = isFavorite;
if (typeof loadingOverlayManager !== 'undefined') window.loadingOverlayManager = loadingOverlayManager;
if (typeof showAlgorithmDetail === 'function') window.showAlgorithmDetail = showAlgorithmDetail;
if (typeof copyToClipboard === 'function') window.copyToClipboard = copyToClipboard;
if (typeof applyCurrentView === 'function') window.applyCurrentView = applyCurrentView;
if (typeof debounce === 'function') window.debounce = debounce;
if (typeof setupClearButton === 'function') window.setupClearButton = setupClearButton;
if (typeof showAddBookmarkModal === 'function') window.showAddBookmarkModal = showAddBookmarkModal;
if (typeof showBookmarkDetail === 'function') window.showBookmarkDetail = showBookmarkDetail;
if (typeof showOrganizeFoldersModal === 'function') window.showOrganizeFoldersModal = showOrganizeFoldersModal;
if (typeof filterBookmarks === 'function') window.filterBookmarks = filterBookmarks;
if (typeof populateBookmarkFolders === 'function') window.populateBookmarkFolders = populateBookmarkFolders;
if (typeof loadExtLinks === 'function') window.loadExtLinks = loadExtLinks;
if (typeof filterExtLinks === 'function') window.filterExtLinks = filterExtLinks;
if (typeof handleExtLinkAction === 'function') window.handleExtLinkAction = handleExtLinkAction;
if (typeof showOrganizeExtLinkCategoriesModal === 'function') window.showOrganizeExtLinkCategoriesModal = showOrganizeExtLinkCategoriesModal;
if (typeof populateExtLinkCategoryFilter === 'function') window.populateExtLinkCategoryFilter = populateExtLinkCategoryFilter;
if (typeof editAlgorithm === 'function') window.editAlgorithm = editAlgorithm;
if (typeof showAddModal === 'function') window.showAddModal = showAddModal;
if (typeof handleReglamentAction === 'function') window.handleReglamentAction = handleReglamentAction;
if (typeof populateReglamentCategoryDropdowns === 'function') window.populateReglamentCategoryDropdowns = populateReglamentCategoryDropdowns;
if (typeof getFavoriteButtonHTML === 'function') window.getFavoriteButtonHTML = getFavoriteButtonHTML;
if (typeof DEFAULT_MAIN_ALGORITHM !== 'undefined') window.DEFAULT_MAIN_ALGORITHM = DEFAULT_MAIN_ALGORITHM;
if (typeof loadFoldersList === 'function') window.loadFoldersList = loadFoldersList;
if (typeof removeEscapeHandler === 'function') window.removeEscapeHandler = removeEscapeHandler;
if (typeof getVisibleModals === 'function') window.getVisibleModals = getVisibleModals;
if (typeof initUI === 'function') window.initUI = initUI;
if (typeof initStepInteractions === 'function') window.initStepInteractions = initStepInteractions;
if (typeof initCollapseAllButtons === 'function') window.initCollapseAllButtons = initCollapseAllButtons;
if (typeof initHotkeysModal === 'function') window.initHotkeysModal = initHotkeysModal;
if (typeof initClearDataFunctionality === 'function') window.initClearDataFunctionality = initClearDataFunctionality;
if (typeof showNoInnModal === 'function') window.showNoInnModal = showNoInnModal;
