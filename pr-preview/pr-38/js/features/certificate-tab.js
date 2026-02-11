'use strict';

import {
    normalizeCertificateInput,
    parseCertificateFromDer,
    checkRevocationStatus,
    classifyUrlAvailability,
} from './certificate-tools.js';

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
        analyzeBtn: document.getElementById('certificateAnalyzeBtn'),
        parseResult: document.getElementById('certificateParseResult'),
        revocationResult: document.getElementById('certificateRevocationResult'),
        endpointInput: document.getElementById('certificateRevocationEndpoint'),
    };
}

async function analyze(elements) {
    const { fileInput, parseResult, revocationResult, endpointInput } = elements;
    const file = fileInput?.files?.[0];

    if (!file) {
        print(parseResult, { ok: false, message: 'Выберите файл сертификата.' });
        print(revocationResult, { status: 'unknown', message: 'Проверка отзыва не выполнялась.' });
        return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const normalized = normalizeCertificateInput(bytes);

    if (!normalized.ok) {
        print(parseResult, normalized);
        print(revocationResult, {
            status: 'unknown',
            message: 'Проверка отзыва не выполнена, так как сертификат не распарсился.',
        });
        return;
    }

    const parsed = parseCertificateFromDer(normalized.derBytes);
    if (!parsed.ok) {
        print(parseResult, {
            ...parsed,
            sourceFormat: normalized.sourceFormat,
        });
        print(revocationResult, {
            status: 'unknown',
            message: 'Проверка отзыва остановлена: ошибка парсинга X.509.',
        });
        return;
    }

    print(parseResult, {
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
    });

    const revocation = await checkRevocationStatus({
        derBase64: parsed.derBase64,
        serialNumberHex: parsed.parsed.serialNumberHex,
        ocspUrls: parsed.parsed.ocspUrls,
        crlUrls: parsed.parsed.crlUrls,
        endpoint: endpointInput?.value?.trim(),
    });

    print(revocationResult, revocation);
}

export function initCertificateTab() {
    const elements = getElements();
    if (!elements.analyzeBtn) return;

    if (elements.analyzeBtn.dataset.initialized === '1') return;
    elements.analyzeBtn.dataset.initialized = '1';

    elements.analyzeBtn.addEventListener('click', () => {
        analyze(elements).catch((error) => {
            print(elements.parseResult, {
                ok: false,
                message: String(error?.message || error),
            });
            print(elements.revocationResult, {
                status: 'unknown',
                message: 'Проверка отзыва прервана из-за ошибки.',
            });
        });
    });

    print(elements.parseResult, {
        info: 'Загрузите сертификат и нажмите «Проверить сертификат».',
    });
    print(elements.revocationResult, {
        info: 'Без backend endpoint статус будет unknown (best effort).',
    });
}
