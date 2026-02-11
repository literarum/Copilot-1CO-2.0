'use strict';

import {
    normalizeCertificateInput,
    parseCertificateFromDer,
    checkRevocationStatus,
    classifyUrlAvailability,
} from '../features/certificate-tools.js';

const fileInput = document.getElementById('certFile');
const analyzeBtn = document.getElementById('analyzeBtn');
const parseResult = document.getElementById('parseResult');
const revocationResult = document.getElementById('revocationResult');
const endpointInput = document.getElementById('revocationEndpoint');

function print(target, payload) {
    target.textContent = JSON.stringify(payload, null, 2);
}

function describeUrls(urls) {
    return (urls || []).map((url) => classifyUrlAvailability(url));
}

async function analyzeSelectedCertificate() {
    const file = fileInput.files?.[0];
    if (!file) {
        print(parseResult, { ok: false, message: 'Выберите файл сертификата.' });
        return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

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

    const parsedResult = {
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
    };
    print(parseResult, parsedResult);

    const revocation = await checkRevocationStatus({
        derBase64: parsed.derBase64,
        serialNumberHex: parsed.parsed.serialNumberHex,
        ocspUrls: parsed.parsed.ocspUrls,
        crlUrls: parsed.parsed.crlUrls,
        endpoint: endpointInput.value.trim(),
    });

    print(revocationResult, revocation);
}

analyzeBtn.addEventListener('click', () => {
    analyzeSelectedCertificate().catch((error) => {
        print(parseResult, {
            ok: false,
            message: String(error?.message || error),
        });
    });
});

print(parseResult, {
    info: 'Загрузите сертификат и нажмите "Проверить сертификат".',
});
print(revocationResult, {
    info: 'По умолчанию работает встроенный эмулятор backend (mock://revocation-local). Для строгой проверки укажите реальный endpoint.',
});
