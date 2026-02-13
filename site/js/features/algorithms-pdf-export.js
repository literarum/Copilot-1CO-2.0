'use strict';

import { escapeHtml, linkify } from '../utils/html.js';
import { formatExampleForTextarea, getSectionName } from '../utils/helpers.js';

let algorithms = null;
let ExportService = null;
let showNotification = null;

export function setAlgorithmsPdfExportDependencies(deps) {
    algorithms = deps.algorithms;
    ExportService = deps.ExportService;
    showNotification = deps.showNotification;
}

function formatMultiline(text) {
    if (!text) return '';
    const escaped = escapeHtml(String(text));
    return escaped.replace(/\n/g, '<br>');
}

function buildAlgorithmSectionExport(sectionId) {
    const sectionAlias = {
        programAlgorithms: 'program',
        skziAlgorithms: 'skzi',
        lk1cAlgorithms: 'lk1c',
        webRegAlgorithms: 'webReg',
    };
    const normalizedSectionId = sectionAlias[sectionId] || sectionId;
    const sectionAlgorithms = algorithms?.[normalizedSectionId];
    if (!Array.isArray(sectionAlgorithms) || sectionAlgorithms.length === 0) {
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-6';

    const title = document.createElement('h1');
    title.className = 'text-2xl font-bold';
    title.textContent = `Алгоритмы: ${getSectionName(normalizedSectionId)}`;
    wrapper.appendChild(title);

    sectionAlgorithms.forEach((algorithm, index) => {
        if (!algorithm) return;
        const card = document.createElement('div');
        card.className =
            'algorithm-step bg-white border border-gray-200 rounded-lg p-4 space-y-3';

        const heading = document.createElement('div');
        heading.className = 'flex items-center gap-2';
        heading.innerHTML = `<h2 class="text-lg font-semibold">${escapeHtml(
            algorithm.title || `Алгоритм ${index + 1}`,
        )}</h2>`;
        card.appendChild(heading);

        const description =
            algorithm.description ||
            algorithm.steps?.[0]?.description ||
            algorithm.steps?.[0]?.title ||
            '';
        if (description) {
            const descEl = document.createElement('p');
            descEl.className = 'text-sm text-gray-700';
            descEl.innerHTML = linkify(formatMultiline(description));
            card.appendChild(descEl);
        }

        if (Array.isArray(algorithm.steps) && algorithm.steps.length > 0) {
            const list = document.createElement('ol');
            list.className = 'space-y-3 text-sm';
            algorithm.steps.forEach((step, stepIndex) => {
                if (!step) return;
                const item = document.createElement('li');
                item.className =
                    'border-l-4 border-primary/60 pl-3 py-2 bg-gray-50 rounded-md';

                const stepTitle = escapeHtml(step.title || `Шаг ${stepIndex + 1}`);
                const descriptionText =
                    typeof step.description === 'string'
                        ? step.description
                        : formatExampleForTextarea(step.description);
                const exampleText = formatExampleForTextarea(step.example);

                let html = `<div class="font-semibold">${stepTitle}</div>`;
                if (descriptionText) {
                    html += `<div class="text-gray-700 mt-1">${formatMultiline(
                        descriptionText,
                    )}</div>`;
                }
                if (step.additionalInfoText) {
                    html += `<div class="text-gray-600 mt-1">${formatMultiline(
                        step.additionalInfoText,
                    )}</div>`;
                }
                if (exampleText) {
                    html += `<div class="text-gray-500 mt-2">${formatMultiline(
                        exampleText,
                    )}</div>`;
                }
                item.innerHTML = linkify(html);
                list.appendChild(item);
            });
            card.appendChild(list);
        }

        wrapper.appendChild(card);
    });

    return wrapper;
}

export function initAlgorithmsPdfExportSystem() {
    const buttons = document.querySelectorAll('[data-algorithm-export]');
    if (!buttons.length) {
        return;
    }

    buttons.forEach((button) => {
        const sectionId = button.dataset.algorithmExport;
        if (!sectionId) return;
        if (button._pdfExportHandler) {
            button.removeEventListener('click', button._pdfExportHandler);
        }
        button._pdfExportHandler = () => {
            if (!ExportService) {
                showNotification?.('Сервис экспорта PDF недоступен.', 'error');
                return;
            }
            const content = buildAlgorithmSectionExport(sectionId);
            if (!content) {
                showNotification?.('В разделе нет алгоритмов для экспорта.', 'warning');
                return;
            }
            const exportSectionAlias = {
                programAlgorithms: 'program',
                skziAlgorithms: 'skzi',
                lk1cAlgorithms: 'lk1c',
                webRegAlgorithms: 'webReg',
            };
            const normalizedSectionId = exportSectionAlias[sectionId] || sectionId;
            const filename = `Алгоритмы_${getSectionName(normalizedSectionId)}`;
            ExportService.exportElementToPdf(content, filename, {
                type: 'algorithm-section',
                section: normalizedSectionId,
            });
        };
        button.addEventListener('click', button._pdfExportHandler);
    });
}

window.initAlgorithmsPdfExportSystem = initAlgorithmsPdfExportSystem;
