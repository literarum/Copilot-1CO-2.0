'use strict';

const BASE64_BODY_RE = /^[A-Za-z0-9+/=\r\n\t\s]+$/;
const PKCS7_SIGNED_DATA_OID_HEX = '2a864886f70d010702';
const DEFAULT_EMULATOR_ENDPOINT = 'mock://revocation-local';
const REVOCATION_MOCK_STORAGE_KEY = 'certificateRevocationMockRevokedSerials';

const SIGNATURE_ALGORITHM_LABELS = {
    '1.2.643.7.1.1.3.2':
        'ГОСТ Р 34.10-2012 / ГОСТ Р 34.11-2012 (ТК-26, 256 бит)',
};

function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToText(bytes) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function looksLikeDerSequence(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 4) return false;
    if (bytes[0] !== 0x30) return false;

    const lengthByte = bytes[1];
    if ((lengthByte & 0x80) === 0) return true;

    const lengthBytesCount = lengthByte & 0x7f;
    return lengthBytesCount > 0 && lengthBytesCount <= 4 && bytes.length > 2 + lengthBytesCount;
}

function normalizeBase64Input(text) {
    return text.replace(/-----BEGIN[^-]+-----/g, '').replace(/-----END[^-]+-----/g, '').replace(/\s+/g, '');
}

function detectContainerType(derBytes) {
    const hex = bytesToHex(derBytes);
    if (hex.includes(PKCS7_SIGNED_DATA_OID_HEX)) {
        return 'pkcs7';
    }
    return 'x509';
}

export function normalizeCertificateInput(fileBytes) {
    if (!(fileBytes instanceof Uint8Array) || fileBytes.length === 0) {
        return {
            ok: false,
            code: 'EMPTY_INPUT',
            message: 'Файл пустой или имеет неподдерживаемый формат.',
        };
    }

    if (looksLikeDerSequence(fileBytes)) {
        const container = detectContainerType(fileBytes);
        if (container === 'pkcs7') {
            return {
                ok: false,
                code: 'PKCS7_NOT_SUPPORTED',
                message: 'Файл похож на PKCS#7 (.p7b), а не на одиночный X.509 сертификат.',
            };
        }

        return { ok: true, derBytes: fileBytes, sourceFormat: 'der' };
    }

    const text = bytesToText(fileBytes);
    const trimmed = text.trim();
    const isPem =
        trimmed.includes('-----BEGIN CERTIFICATE-----') ||
        trimmed.includes('-----BEGIN X509 CERTIFICATE-----');
    const isPossibleBase64 = BASE64_BODY_RE.test(trimmed);

    if (!isPem && !isPossibleBase64) {
        return {
            ok: false,
            code: 'UNSUPPORTED_ENCODING',
            message: 'Не удалось распознать DER, PEM или base64-сертификат.',
        };
    }

    try {
        const body = normalizeBase64Input(trimmed);
        const decoded = base64ToBytes(body);
        if (!looksLikeDerSequence(decoded)) {
            return {
                ok: false,
                code: 'NOT_X509_DER',
                message: 'После декодирования base64 не получен корректный DER X.509.',
            };
        }

        const container = detectContainerType(decoded);
        if (container === 'pkcs7') {
            return {
                ok: false,
                code: 'PKCS7_NOT_SUPPORTED',
                message: 'Файл похож на PKCS#7 (.p7b), а не на одиночный X.509 сертификат.',
            };
        }

        return {
            ok: true,
            derBytes: decoded,
            sourceFormat: isPem ? 'pem' : 'base64',
        };
    } catch {
        return {
            ok: false,
            code: 'BASE64_DECODE_FAILED',
            message: 'Не удалось декодировать base64-представление сертификата.',
        };
    }
}

function uniqueUrls(urls) {
    return Array.from(new Set((urls || []).filter(Boolean)));
}

function parseAiaInfo(aiaInfo) {
    const ocspUrls = [];
    const caIssuerUrls = [];

    if (!aiaInfo) return { ocspUrls, caIssuerUrls };

    if (Array.isArray(aiaInfo.ocsp)) {
        ocspUrls.push(...aiaInfo.ocsp);
    }

    if (Array.isArray(aiaInfo.caissuer)) {
        caIssuerUrls.push(...aiaInfo.caissuer);
    }

    if (Array.isArray(aiaInfo.array)) {
        for (const item of aiaInfo.array) {
            if (item?.ocsp) ocspUrls.push(item.ocsp);
            if (item?.caissuer) caIssuerUrls.push(item.caissuer);
            if (item?.uri && item?.type === 'ocsp') ocspUrls.push(item.uri);
            if (item?.uri && item?.type === 'caissuer') caIssuerUrls.push(item.uri);
        }
    }

    return {
        ocspUrls: uniqueUrls(ocspUrls),
        caIssuerUrls: uniqueUrls(caIssuerUrls),
    };
}

function isPrivateHost(hostname) {
    if (!hostname) return false;
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local')) return true;

    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
        const [a, b] = h.split('.').map(Number);
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
    }

    return !h.includes('.');
}

export function classifyUrlAvailability(url) {
    try {
        const parsed = new URL(url);
        return {
            url,
            isLikelyInternal: isPrivateHost(parsed.hostname),
            protocol: parsed.protocol,
        };
    } catch {
        return {
            url,
            isLikelyInternal: false,
            protocol: null,
        };
    }
}

function getSignatureAlgorithmLabel(oidOrName) {
    const value = String(oidOrName || '');
    return SIGNATURE_ALGORITHM_LABELS[value] || null;
}

export function parseCertificateFromDer(derBytes, x509Ctor = window.X509) {
    if (!x509Ctor) {
        return {
            ok: false,
            code: 'X509_LIBRARY_NOT_AVAILABLE',
            message: 'Библиотека X509 не загружена.',
        };
    }

    const certHex = bytesToHex(derBytes);

    try {
        const cert = new x509Ctor();
        cert.readCertHex(certHex);

        const aiaInfo = typeof cert.getExtAIAInfo === 'function' ? cert.getExtAIAInfo() : null;
        const parsedAia = parseAiaInfo(aiaInfo);

        let crlUrls = [];
        if (typeof cert.getExtCRLDistributionPointsURI === 'function') {
            crlUrls = uniqueUrls(cert.getExtCRLDistributionPointsURI() || []);
        }

        return {
            ok: true,
            certHex,
            derBase64: bytesToBase64(derBytes),
            parsed: {
                serialNumberHex: cert.getSerialNumberHex?.() || null,
                issuer: cert.getIssuerString?.() || null,
                subject: cert.getSubjectString?.() || null,
                notBefore: cert.getNotBefore?.() || null,
                notAfter: cert.getNotAfter?.() || null,
                signatureAlgorithm: cert.getSignatureAlgorithmName?.() || null,
                signatureAlgorithmLabel: getSignatureAlgorithmLabel(
                    cert.getSignatureAlgorithmName?.() || null,
                ),
                ocspUrls: parsedAia.ocspUrls,
                caIssuerUrls: parsedAia.caIssuerUrls,
                crlUrls,
            },
        };
    } catch (error) {
        return {
            ok: false,
            code: 'X509_PARSE_FAILED',
            message: 'Не удалось распарсить X.509 сертификат.',
            details: String(error?.message || error),
        };
    }
}

function isEmulatedEndpoint(endpoint) {
    if (!endpoint) return true;
    const normalized = String(endpoint).trim().toLowerCase();
    return normalized.startsWith('mock://') || normalized.startsWith('emulator://');
}

function readMockRevokedSerials() {
    const fallback = [];
    if (typeof localStorage === 'undefined') return fallback;

    try {
        const raw = localStorage.getItem(REVOCATION_MOCK_STORAGE_KEY) || '';
        return raw
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean);
    } catch {
        return fallback;
    }
}

async function probeUrl(url, timeoutMs) {
    const meta = classifyUrlAvailability(url);
    if (meta.isLikelyInternal) {
        return {
            url,
            reachable: false,
            skipped: true,
            reason: 'likely_internal',
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-store',
            signal: controller.signal,
        });

        return {
            url,
            reachable: Boolean(response),
            skipped: false,
            status: response?.status ?? null,
            type: response?.type ?? null,
        };
    } catch (error) {
        return {
            url,
            reachable: false,
            skipped: false,
            reason: String(error?.message || error),
        };
    } finally {
        clearTimeout(timer);
    }
}

async function emulateRevocationStatus({ serialNumberHex, ocspUrls, crlUrls, timeoutMs }) {
    const serial = String(serialNumberHex || '').toLowerCase();
    const revokedSerials = readMockRevokedSerials();

    const checks = [];
    const urls = [...(ocspUrls || []), ...(crlUrls || [])].filter(Boolean);
    for (const url of urls) {
        checks.push(await probeUrl(url, Math.min(timeoutMs, 4500)));
    }

    if (serial && revokedSerials.includes(serial)) {
        return {
            status: 'revoked',
            source: 'emulator',
            endpoint: DEFAULT_EMULATOR_ENDPOINT,
            definitive: false,
            verificationLevel: 'emulator-best-effort',
            message:
                'Серийный номер найден в локальном mock-списке отозванных сертификатов (localStorage).',
            details: {
                storageKey: REVOCATION_MOCK_STORAGE_KEY,
                checkedUrls: checks,
            },
        };
    }

    const hasReachableEndpoint = checks.some((item) => item.reachable);

    if (hasReachableEndpoint) {
        return {
            status: 'unknown',
            source: 'emulator',
            endpoint: DEFAULT_EMULATOR_ENDPOINT,
            definitive: false,
            verificationLevel: 'emulator-best-effort',
            message:
                'Внешние OCSP/CRL точки частично доступны, но без криптографической проверки подписи ответов итоговый статус отзыва не может считаться достоверным.',
            details: {
                checkedUrls: checks,
                confidence: 'low',
                suggestedStatus: 'likely_good',
                warning:
                    'Для достоверного статуса используйте реальный backend/native слой с проверкой цепочки и подписи OCSP/CRL.',
            },
        };
    }

    return {
        status: 'unknown',
        source: 'emulator',
        endpoint: DEFAULT_EMULATOR_ENDPOINT,
        definitive: false,
        verificationLevel: 'emulator-best-effort',
        message:
            'Эмулятор backend не смог получить данные с внешних OCSP/CRL точек. Статус отзыва не подтвержден.',
        details: {
            checkedUrls: checks,
            confidence: 'low',
            warning:
                'Это best-effort результат без криптографической верификации ответа OCSP/CRL.',
        },
    };
}

export async function checkRevocationStatus({
    derBase64,
    serialNumberHex,
    ocspUrls,
    crlUrls,
    endpoint,
    timeoutMs = 12000,
}) {
    const effectiveEndpoint = (endpoint || '').trim();

    if (isEmulatedEndpoint(effectiveEndpoint)) {
        return emulateRevocationStatus({
            serialNumberHex,
            ocspUrls,
            crlUrls,
            timeoutMs,
        });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(effectiveEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                derBase64,
                serialNumberHex,
                ocspUrls,
                crlUrls,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            return {
                status: 'unknown',
                source: 'backend',
                message: `Backend вернул ошибку HTTP ${response.status}.`,
            };
        }

        const data = await response.json();
        return {
            status: data.revocation || data.status || 'unknown',
            source: 'backend',
            endpoint: effectiveEndpoint,
            definitive: typeof data.definitive === 'boolean' ? data.definitive : true,
            verificationLevel: data.verificationLevel || 'backend-verified',
            message: data.message || null,
            details: data,
        };
    } catch (error) {
        return {
            status: 'unknown',
            source: 'backend',
            endpoint: effectiveEndpoint,
            definitive: false,
            verificationLevel: 'backend-unreachable',
            message: `Проверка не выполнена: ${String(error?.message || error)}`,
        };
    } finally {
        clearTimeout(timer);
    }
}
