'use strict';

import {
    normalizeCertificateInput,
    parseCertificateFromDer,
    checkRevocationStatus,
    classifyUrlAvailability,
} from './certificate-tools.js';

const DEFAULT_ENDPOINT = 'mock://revocation-local';
const X509_CDN_CANDIDATES = [
    'https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/11.1.0/jsrsasign-all-min.js',
    'https://cdn.jsdelivr.net/npm/jsrsasign@11.1.0/lib/jsrsasign-all-min.js',
];

let x509LoaderPromise = null;

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

function loadScriptOnce(src, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-x509-src="${src}"]`);
        if (existing && existing.dataset.loaded === '1') {
            resolve();
            return;
        }

        if (existing && existing.dataset.loading === '1') {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener(
                'error',
                () => reject(new Error(`Не удалось загрузить скрипт: ${src}`)),
                { once: true },
            );
            return;
        }

        const script = existing || document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.dataset.x509Src = src;
        script.dataset.loading = '1';

        const timer = setTimeout(() => {
            reject(new Error(`Таймаут загрузки скрипта X509: ${src}`));
        }, timeoutMs);

        script.addEventListener(
            'load',
            () => {
                clearTimeout(timer);
                script.dataset.loading = '0';
                script.dataset.loaded = '1';
                resolve();
            },
            { once: true },
        );

        script.addEventListener(
            'error',
            () => {
                clearTimeout(timer);
                script.dataset.loading = '0';
                reject(new Error(`Не удалось загрузить скрипт X509: ${src}`));
            },
            { once: true },
        );

        if (!existing) {
            document.head.appendChild(script);
        }
    });
}

async function ensureX509Library() {
    if (window.X509) return window.X509;
    if (x509LoaderPromise) return x509LoaderPromise;

    x509LoaderPromise = (async () => {
        for (const src of X509_CDN_CANDIDATES) {
            try {
                await loadScriptOnce(src);
                if (window.X509) return window.X509;
            } catch (error) {
                console.warn('[certificate-tab] Ошибка загрузки X509 библиотеки:', src, error);
            }
        }

        return null;
    })();

    return x509LoaderPromise;
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

    const x509Ctor = await ensureX509Library();
    if (!x509Ctor) {
        print(elements.result, {
            parse: {
                ok: false,
                code: 'X509_LIBRARY_NOT_AVAILABLE',
                message:
                    'Библиотека X509 не загружена. Проверьте доступ к CDN (cdnjs/jsdelivr) или добавьте jsrsasign локально.',
                sourceFormat: normalized.sourceFormat,
            },
            revocation: {
                status: 'unknown',
                message: 'Проверка отзыва остановлена: отсутствует библиотека X509.',
            },
        });
        return;
    }

    const parsed = parseCertificateFromDer(normalized.derBytes, x509Ctor);
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
            signatureAlgorithmLabel: parsed.parsed.signatureAlgorithmLabel,
            ocspUrls: describeUrls(parsed.parsed.ocspUrls),
            crlUrls: describeUrls(parsed.parsed.crlUrls),
            caIssuerUrls: describeUrls(parsed.parsed.caIssuerUrls),
        },
        revocation,
        interpretation: buildRevocationSummary(revocation),
    });
}

function handleDropZoneKeyboard(event, fileInput) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
    }
}

function buildRevocationSummary(revocation) {
    if (!revocation) return null;

    if (revocation.status === 'revoked') {
        return 'Сертификат отмечен как отозванный в доступном источнике эмулятора. Для юридически значимого подтверждения используйте backend с криптографической проверкой.';
    }

    if (revocation.status === 'unknown') {
        return 'Статус отзыва не подтвержден. Нельзя делать вывод "сертификат точно не отозван" без реальной проверки OCSP/CRL и валидации цепочки.';
    }

    return 'Статус выглядит положительным, но проверьте поле definitive/verificationLevel перед финальным выводом.';
}

function showAnalyzeError(elements, error) {
    print(elements.result, {
        parse: { ok: false, message: String(error?.message || error) },
        revocation: { status: 'unknown', message: 'Проверка отзыва прервана из-за ошибки.' },
    });
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
        analyzeFile(file, elements).catch((error) => showAnalyzeError(elements, error));
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

        analyzeFile(file, elements).catch((error) => showAnalyzeError(elements, error));
    });

    elements.resetBtn.addEventListener('click', () => {
        elements.fileInput.value = '';
        elements.selectedFileName.textContent = '';
        clearResults(elements);
    });
}
