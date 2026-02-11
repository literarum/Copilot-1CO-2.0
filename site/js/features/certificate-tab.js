'use strict';

import {
    normalizeCertificateInput,
    parseCertificateFromDer,
    checkRevocationStatus,
    classifyUrlAvailability,
} from './certificate-tools.js';

const DEFAULT_ENDPOINT = 'mock://revocation-local';

function print(target, payload) {
    if (!target) return;
    target.textContent = JSON.stringify(payload, null, 2);
}

function describeUrls(urls) {
    return (urls || []).map((url) => classifyUrlAvailability(url));
}

function getElements() {
    return {
        fileInput: document.getElementById('certificateFileInput'),
        dropZone: document.getElementById('certificateDropZone'),
        selectedFileName: document.getElementById('certificateSelectedFileName'),
        resetBtn: document.getElementById('certificateResetBtn'),
        result: document.getElementById('certificateResult'),
    };
}

function clearResults(elements) {
    print(elements.result, {
        info: 'Загрузите сертификат через перетаскивание или выбор файла.',
    });
}

async function analyzeFile(file, elements) {
    if (!file) {
        clearResults(elements);
        return;
    }

    elements.selectedFileName.textContent = `Загружен файл: ${file.name}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const normalized = normalizeCertificateInput(bytes);

    if (!normalized.ok) {
        print(elements.result, {
            parse: normalized,
            revocation: {
                status: 'unknown',
                message: 'Проверка отзыва не выполнена, так как сертификат не распарсился.',
            },
        });
        return;
    }

    const parsed = parseCertificateFromDer(normalized.derBytes);
    if (!parsed.ok) {
        print(elements.result, {
            parse: {
                ...parsed,
                sourceFormat: normalized.sourceFormat,
            },
            revocation: {
                status: 'unknown',
                message: 'Проверка отзыва остановлена: ошибка парсинга X.509.',
            },
        });
        return;
    }

    const revocation = await checkRevocationStatus({
        derBase64: parsed.derBase64,
        serialNumberHex: parsed.parsed.serialNumberHex,
        ocspUrls: parsed.parsed.ocspUrls,
        crlUrls: parsed.parsed.crlUrls,
        endpoint: DEFAULT_ENDPOINT,
    });

    print(elements.result, {
        parse: {
            ok: true,
            sourceFormat: normalized.sourceFormat,
            serialNumberHex: parsed.parsed.serialNumberHex,
            issuer: parsed.parsed.issuer,
            subject: parsed.parsed.subject,
            notBefore: parsed.parsed.notBefore,
            notAfter: parsed.parsed.notAfter,
            signatureAlgorithm: parsed.parsed.signatureAlgorithm,
            ocspUrls: describeUrls(parsed.parsed.ocspUrls),
            crlUrls: describeUrls(parsed.parsed.crlUrls),
            caIssuerUrls: describeUrls(parsed.parsed.caIssuerUrls),
        },
        revocation,
    });
}

function handleDropZoneKeyboard(event, fileInput) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
    }
}

export function initCertificateTab() {
    const elements = getElements();
    if (!elements.fileInput || !elements.dropZone || !elements.result || !elements.resetBtn) return;

    if (elements.dropZone.dataset.initialized === '1') return;
    elements.dropZone.dataset.initialized = '1';

    clearResults(elements);

    elements.dropZone.addEventListener('click', () => {
        elements.fileInput.click();
    });

    elements.dropZone.addEventListener('keydown', (event) => {
        handleDropZoneKeyboard(event, elements.fileInput);
    });

    elements.fileInput.addEventListener('change', () => {
        const file = elements.fileInput.files?.[0];
        analyzeFile(file, elements).catch((error) => {
            print(elements.result, {
                parse: { ok: false, message: String(error?.message || error) },
                revocation: { status: 'unknown', message: 'Проверка отзыва прервана из-за ошибки.' },
            });
        });
    });

    elements.dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        elements.dropZone.classList.add('border-primary');
    });

    elements.dropZone.addEventListener('dragleave', () => {
        elements.dropZone.classList.remove('border-primary');
    });

    elements.dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        elements.dropZone.classList.remove('border-primary');

        const file = event.dataTransfer?.files?.[0];
        if (!file) return;

        const dt = new DataTransfer();
        dt.items.add(file);
        elements.fileInput.files = dt.files;

        analyzeFile(file, elements).catch((error) => {
            print(elements.result, {
                parse: { ok: false, message: String(error?.message || error) },
                revocation: { status: 'unknown', message: 'Проверка отзыва прервана из-за ошибки.' },
            });
        });
    });

    elements.resetBtn.addEventListener('click', () => {
        elements.fileInput.value = '';
        elements.selectedFileName.textContent = '';
        clearResults(elements);
    });
}
