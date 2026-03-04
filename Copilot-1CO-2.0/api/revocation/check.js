/**
 * Serverless handler (legacy/dev): API проверки отзыва сертификатов
 * Эндпоинт: POST/GET /api/revocation/check
 * Поддерживает: JSON/текстовые списки отзыва и бинарный X.509 CRL (в т.ч. ФНС).
 * Гибридный режим: клиент может прислать уже скачанный CRL (base64) — парсинг без сетевого запроса.
 * CORS разрешён для всех источников.
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};
const CRL_FETCH_ATTEMPTS = 2;
const CRL_FETCH_TIMEOUT_MS = 25000;
const CHECK_REVOCATION_BUDGET_MS = 35000;
const MAX_CRL_BASE64_LENGTH = 4 * 1024 * 1024;
const FNS_PREFER_HTTP_HOSTS = new Set(['pki.tax.gov.ru', 'uc.nalog.ru', 'cdp.tax.gov.ru']);
const DEBUG_TAG = '[revocation/check]';
const RUNTIME_KIND = 'nodejs';
const OPTIONAL_PROXY_BASE =
    (typeof process !== 'undefined' && process?.env?.REVOCATION_PROXY_URL) || '';
const LOCAL_HELPER_ALLOWLIST = new Set(['localhost', '127.0.0.1']);
const HELPER_BASE_FROM_ENV =
    (typeof process !== 'undefined' && process?.env?.REVOCATION_LOCAL_HELPER_BASE_URL) || '';

function isPrivateOrLocalHost(hostname) {
    const h = hostname.toLowerCase();
    if (LOCAL_HELPER_ALLOWLIST.has(h) || h.endsWith('.localhost')) return true;
    if (/^127\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^169\.254\.|^::1$|^fe80:/i.test(h))
        return true;
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
        const parts = h.split('.').map(Number);
        if (parts[0] === 10) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
        if (parts[0] === 127) return true;
    }
    return false;
}

function createError(message, code, details = null) {
    const error = new Error(message);
    error.code = code;
    if (details) {
        error.details = details;
    }
    return error;
}

function logEvent(event) {
    try {
        console.info(DEBUG_TAG, {
            timestamp: new Date().toISOString(),
            runtime: RUNTIME_KIND,
            ...event,
        });
    } catch {
        // no-op
    }
}

function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...headers },
    });
}

function corsPreflight() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function readDerLength(bytes, offset) {
    const first = bytes[offset];
    if (first < 0x80) return { length: first, byteLength: 1 };
    const numBytes = first & 0x7f;
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
        length = (length << 8) | bytes[offset + 1 + i];
    }
    return { length, byteLength: 1 + numBytes };
}

function parseDerNode(bytes, offset = 0) {
    if (offset >= bytes.length) throw new Error('ASN.1: выход за пределы буфера');
    const tag = bytes[offset];
    const lengthInfo = readDerLength(bytes, offset + 1);
    const headerLength = 1 + lengthInfo.byteLength;
    const valueStart = offset + headerLength;
    const valueEnd = valueStart + lengthInfo.length;
    if (valueEnd > bytes.length) throw new Error('ASN.1: некорректная длина');
    const node = {
        tag,
        length: lengthInfo.length,
        valueStart,
        valueEnd,
        end: valueEnd,
        children: [],
    };
    const isConstructed = (tag & 0x20) === 0x20;
    if (isConstructed) {
        let cursor = valueStart;
        while (cursor < valueEnd) {
            const child = parseDerNode(bytes, cursor);
            node.children.push(child);
            cursor = child.end;
        }
    }
    return node;
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

function normalizeHex(hex) {
    const normalized = hex.replace(/^0+/, '');
    return normalized.length ? normalized : '0';
}

function decodeBase64ToUint8(base64Data) {
    const sanitized = String(base64Data || '').replace(/\s+/g, '');
    try {
        if (typeof atob === 'function') {
            const raw = atob(sanitized);
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            return bytes;
        }
        if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(sanitized, 'base64'));
        }
        throw new Error('base64 decoder is unavailable');
    } catch (error) {
        throw createError('Не удалось декодировать base64 данные.', 'crl_decode_failed', {
            reason: error?.message || String(error),
        });
    }
}

function withOptionalProxy(url) {
    const base = OPTIONAL_PROXY_BASE.trim();
    if (!base) return url;
    const normalizedBase = base.replace(/\/$/, '');
    return `${normalizedBase}?url=${encodeURIComponent(url)}`;
}

/** CRL helper contract: GET /helper?url=<CRL_URL>. Both Node and Python helpers expect this path. */
const HELPER_PATH = '/helper';

function withHelperProxy(url, helperBaseUrl) {
    const base = String(helperBaseUrl || '').trim();
    if (!base) return null;
    const normalizedBase = base.replace(/\/$/, '');
    const helperPath = normalizedBase.endsWith(HELPER_PATH)
        ? normalizedBase
        : `${normalizedBase}${HELPER_PATH}`;
    return `${helperPath}?url=${encodeURIComponent(url)}`;
}

function isProxiedUrl(url) {
    const base = OPTIONAL_PROXY_BASE.trim();
    if (!base) return false;
    const normalizedBase = base.replace(/\/$/, '');
    return String(url || '').startsWith(normalizedBase);
}

function isHelperUrl(url, helperBaseUrl) {
    const base = String(helperBaseUrl || '').trim();
    if (!base) return false;
    const normalizedBase = base.replace(/\/$/, '');
    return String(url || '').startsWith(normalizedBase);
}

function normalizeHelperBaseUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        const host = parsed.hostname.toLowerCase();
        const base = parsed.origin + parsed.pathname.replace(/\/$/, '');
        if (LOCAL_HELPER_ALLOWLIST.has(host) || host.endsWith('.localhost')) return base;
        if (isPrivateOrLocalHost(host)) return '';
        return base;
    } catch {
        return '';
    }
}

function buildCandidateListUrls(listUrl) {
    const original = String(listUrl || '').trim();
    if (!original) return [];

    const lower = original.toLowerCase();
    const isCrlLike = lower.endsWith('.crl') || lower.includes('/cdp/');
    if (!isCrlLike) return [original];

    try {
        const parsed = new URL(original);
        const host = parsed.hostname.toLowerCase();
        const isGostHost = FNS_PREFER_HTTP_HOSTS.has(host);

        const httpUrl = `http://${host}${parsed.pathname}${parsed.search}`;
        const httpsUrl = `https://${host}${parsed.pathname}${parsed.search}`;

        if (isGostHost) {
            return [httpUrl, httpsUrl];
        }
        if (parsed.protocol === 'https:') {
            return [httpsUrl, httpUrl];
        }
        return [httpUrl, httpsUrl];
    } catch {
        const candidates = [original];
        if (lower.startsWith('https://')) {
            candidates.push(`http://${original.slice('https://'.length)}`);
        }
        return Array.from(new Set(candidates));
    }
}

function buildSourceCandidates(listUrl, helperBaseUrl) {
    const baseUrls = buildCandidateListUrls(listUrl);
    const useProxy = Boolean(OPTIONAL_PROXY_BASE.trim());
    const candidates = [];
    for (const baseUrl of baseUrls) {
        if (helperBaseUrl) {
            const helperUrl = withHelperProxy(baseUrl, helperBaseUrl);
            if (helperUrl) candidates.push({ url: helperUrl, source: 'local-helper' });
        }
        candidates.push({ url: baseUrl, source: 'server' });
        if (useProxy) {
            candidates.push({ url: withOptionalProxy(baseUrl), source: 'server-proxy' });
        }
    }
    return candidates;
}

async function fetchWithRetry(
    url,
    attempts = CRL_FETCH_ATTEMPTS,
    timeoutMs = CRL_FETCH_TIMEOUT_MS,
) {
    const timeoutSignal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? () => AbortSignal.timeout(timeoutMs)
            : null;
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
        const controller = timeoutSignal ? null : new AbortController();
        const timer = timeoutSignal ? null : setTimeout(() => controller.abort(), timeoutMs);
        try {
            const startedAt = Date.now();
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'manual',
                signal: timeoutSignal ? timeoutSignal() : controller.signal,
                headers: {
                    Accept: 'application/x-x509-crl, application/pkix-crl, application/octet-stream, */*',
                    'User-Agent': 'Copilot-1CO-Revocation-Checker/1.0',
                    'Cache-Control': 'no-cache',
                },
            });
            if (timer) clearTimeout(timer);
            logEvent({
                stage: 'fetchWithRetry',
                source: 'server',
                url,
                status: response.status,
                durationMs: Date.now() - startedAt,
            });
            return response;
        } catch (e) {
            if (timer) clearTimeout(timer);
            const isAbort = e?.name === 'AbortError' || e?.name === 'TimeoutError';
            lastError = isAbort
                ? createError('timeout', 'crl_fetch_timeout')
                : createError(e?.message || 'fetch failed', 'crl_fetch_network');
            logEvent({
                stage: 'fetchWithRetry',
                source: 'server',
                url,
                errorCode: lastError.code,
                errorMessage: lastError.message,
            });
            // #region agent log
            try {
                fetch('http://127.0.0.1:7520/ingest/374fe693-b6e8-47c0-81cf-9d56349887e0', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Debug-Session-Id': 'd2ebc4',
                    },
                    body: JSON.stringify({
                        sessionId: 'd2ebc4',
                        location: 'check.js:fetchWithRetry',
                        message: 'fetchWithRetry error',
                        data: {
                            url,
                            attemptIndex: i,
                            attempts,
                            timeoutMs,
                            isAbort,
                            errorName: e?.name || null,
                            errorMessage: e?.message || null,
                            errorCode: lastError.code,
                        },
                        timestamp: Date.now(),
                        hypothesisId: 'H_SERVER_FETCH',
                    }),
                }).catch(() => {});
            } catch {
                /* intentional no-op */
            }
            // #endregion
            if (i < attempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
            }
        }
    }
    throw lastError || new Error('fetch failed');
}

async function maybeDecompressGzip(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const ds = new DecompressionStream('gzip');
        const decompressed = await new Response(
            new Blob([buffer]).stream().pipeThrough(ds),
        ).arrayBuffer();
        return decompressed;
    }
    return buffer;
}

/** Из бинарного CRL (DER или PEM) извлекает Set нормализованных серийных номеров. */
function parseCrlRevokedSerials(buffer) {
    let bytes = new Uint8Array(buffer);
    if (bytes.length === 0) throw createError('Пустой ответ сервера (0 байт).', 'crl_empty');

    const maybeText = new TextDecoder('utf-8').decode(bytes);
    if (maybeText.trimStart().startsWith('<')) {
        const preview = maybeText.slice(0, 200).replace(/\s+/g, ' ');
        throw createError(`Сервер вернул HTML вместо CRL: "${preview}…"`, 'crl_html_response');
    }

    if (maybeText.includes('BEGIN X509 CRL')) {
        const base64 = maybeText
            .replace(/-----BEGIN[^-]+-----/g, '')
            .replace(/-----END[^-]+-----/g, '')
            .replace(/\s+/g, '');
        bytes = decodeBase64ToUint8(base64);
    }

    let root;
    try {
        root = parseDerNode(bytes);
    } catch (error) {
        throw createError('ASN.1 парсинг CRL не удался.', 'crl_asn1_failed', {
            reason: error?.message || String(error),
            bytes: bytes.length,
            hexPreview: bytesToHex(bytes.slice(0, 16)),
        });
    }
    const tbs = root.children[0];
    if (!tbs || tbs.tag !== 0x30) {
        const hexPreview = bytesToHex(bytes.slice(0, 16));
        throw createError(
            `Не удалось прочитать CRL (tag=0x${(tbs?.tag ?? 0).toString(16)}, hex=${hexPreview}).`,
            'crl_tbs_not_found',
            { tag: tbs?.tag ?? 0, hexPreview },
        );
    }

    const tbsChildren = tbs.children;
    let cursor = 0;
    if (tbsChildren[0]?.tag === 0x02 && tbsChildren[1]?.tag === 0x30) cursor += 1;

    let revokedNode = null;
    const possibleNext = tbsChildren[cursor + 3];
    if (possibleNext && (possibleNext.tag === 0x17 || possibleNext.tag === 0x18)) {
        revokedNode = tbsChildren[cursor + 4];
    } else {
        revokedNode = possibleNext;
    }
    if (revokedNode && revokedNode.tag !== 0x30) revokedNode = null;

    const revoked = new Set();
    if (revokedNode && Array.isArray(revokedNode.children)) {
        revokedNode.children.forEach((entry) => {
            if (!entry.children || entry.children.length < 2) return;
            const serialNode = entry.children[0];
            if (serialNode.tag !== 0x02) return;
            const serialHex = bytesToHex(bytes.slice(serialNode.valueStart, serialNode.valueEnd));
            revoked.add(normalizeHex(serialHex));
        });
    }
    return revoked;
}

async function processCrlResponse(buffer, contentType, candidateUrl, normalizedSerial) {
    const ct = (contentType || '').toLowerCase();

    if (ct.includes('application/json')) {
        let data;
        try {
            data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer)));
        } catch (e) {
            return {
                errorCode: 'crl_json_invalid',
                error: `invalid JSON list (${candidateUrl}): ${e.message}`,
            };
        }
        const list = Array.isArray(data) ? data : data.revoked || data.serials || data.list || [];
        const revoked = list.some((item) => {
            const s = typeof item === 'string' ? item : item.serial || item;
            return String(s).trim().toUpperCase() === normalizedSerial;
        });
        return { revoked, serial: normalizedSerial };
    }

    if (
        ct.includes('x509-crl') ||
        ct.includes('pkix-crl') ||
        ct.includes('octet-stream') ||
        candidateUrl.toLowerCase().endsWith('.crl') ||
        !ct.includes('text')
    ) {
        try {
            const decompressed = await maybeDecompressGzip(buffer);
            const revokedSet = parseCrlRevokedSerials(decompressed);
            return { revoked: revokedSet.has(normalizedSerial), serial: normalizedSerial };
        } catch (e) {
            return {
                errorCode: e?.code || 'crl_parse_failed',
                error: `CRL parse error (${candidateUrl}): ${e.message}`,
            };
        }
    }

    const text = new TextDecoder().decode(new Uint8Array(buffer));
    const lines = text
        .split(/\r?\n/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    return { revoked: lines.includes(normalizedSerial), serial: normalizedSerial };
}

async function checkRevocation(serial, listUrl, options = {}) {
    if (!serial || typeof serial !== 'string') {
        return { revoked: false, errorCode: 'serial_invalid', error: 'missing or invalid serial' };
    }
    const normalizedSerial = serial.trim().toUpperCase();
    if (!listUrl || typeof listUrl !== 'string') {
        return { revoked: false, errorCode: 'list_url_missing', error: 'missing listUrl' };
    }

    const helperBaseUrl = normalizeHelperBaseUrl(options.helperBaseUrl);
    const sourceCandidates = buildSourceCandidates(listUrl, helperBaseUrl);
    // #region agent log
    if (typeof process === 'undefined' || !process.env.VITEST) {
        try {
            fetch('http://127.0.0.1:7520/ingest/374fe693-b6e8-47c0-81cf-9d56349887e0', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd2ebc4' },
                body: JSON.stringify({
                    sessionId: 'd2ebc4',
                    location: 'check.js:checkRevocation',
                    message: 'sourceCandidates built',
                    data: {
                        helperBaseUrlRaw: options.helperBaseUrl || '',
                        helperBaseUrlNormalized: helperBaseUrl,
                        firstUrl: listUrl?.slice?.(0, 60),
                        sources: sourceCandidates.map((c) => c.source),
                        candidateCount: sourceCandidates.length,
                        candidates: sourceCandidates.map((c) => c.url),
                    },
                    timestamp: Date.now(),
                    hypothesisId: 'H_SERVER_CANDIDATES',
                }),
            }).catch(() => {
                /* intentional no-op */
            });
        } catch {
            /* intentional no-op */
        }
    }
    // #endregion
    let lastError = null;
    let lastErrorCode = null;
    const startedAt = Date.now();
    const attemptPath = [];

    for (const candidate of sourceCandidates) {
        const candidateUrl = candidate.url;
        const candidateSource = candidate.source;
        if (Date.now() - startedAt > CHECK_REVOCATION_BUDGET_MS) {
            lastError = lastError || `timeout budget exceeded (${CHECK_REVOCATION_BUDGET_MS}ms)`;
            lastErrorCode = lastErrorCode || 'crl_timeout_budget_exceeded';
            attemptPath.push({
                url: candidateUrl,
                source: candidateSource,
                errorCode: 'crl_timeout_budget_exceeded',
            });
            break;
        }

        let res;
        try {
            res = await fetchWithRetry(candidateUrl);
        } catch (e) {
            lastError = lastError || `${candidateUrl}: ${e.message}`;
            lastErrorCode = lastErrorCode || e?.code || 'crl_fetch_failed';
            attemptPath.push({
                url: candidateUrl,
                source: candidateSource,
                errorCode: e?.code || 'crl_fetch_failed',
            });
            continue;
        }

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers?.get?.('location') || '';
            if (location.startsWith('https://')) {
                lastError =
                    lastError || `${candidateUrl}: redirect → HTTPS (ГОСТ TLS — не поддерживается)`;
                lastErrorCode = lastErrorCode || 'crl_redirect_https';
                attemptPath.push({
                    url: candidateUrl,
                    source: candidateSource,
                    errorCode: 'crl_redirect_https',
                });
            } else if (location) {
                lastError = lastError || `${candidateUrl}: redirect → ${location}`;
                lastErrorCode = lastErrorCode || 'crl_redirect_other';
                attemptPath.push({
                    url: candidateUrl,
                    source: candidateSource,
                    errorCode: 'crl_redirect_other',
                });
            } else {
                lastError = lastError || `${candidateUrl}: redirect ${res.status}`;
                lastErrorCode = lastErrorCode || 'crl_redirect_unknown';
                attemptPath.push({
                    url: candidateUrl,
                    source: candidateSource,
                    errorCode: 'crl_redirect_unknown',
                });
            }
            continue;
        }

        if (!res.ok) {
            lastError = lastError || `${candidateUrl}: HTTP ${res.status}`;
            lastErrorCode = lastErrorCode || 'crl_http_error';
            attemptPath.push({
                url: candidateUrl,
                source: candidateSource,
                errorCode: 'crl_http_error',
            });
            continue;
        }

        const contentType = (res.headers?.get?.('Content-Type') || '').toLowerCase();
        const buffer = await res.arrayBuffer();
        const result = await processCrlResponse(
            buffer,
            contentType,
            candidateUrl,
            normalizedSerial,
        );
        if (result.error) {
            lastError = lastError || result.error;
            lastErrorCode = lastErrorCode || result.errorCode || 'crl_processing_failed';
            attemptPath.push({
                url: candidateUrl,
                source: candidateSource,
                errorCode: result.errorCode || 'crl_processing_failed',
            });
            continue;
        }
        logEvent({
            stage: 'checkRevocation',
            source: 'server',
            url: candidateUrl,
            serial: normalizedSerial,
            revoked: result.revoked,
            viaProxy: isProxiedUrl(candidateUrl),
            viaHelper: isHelperUrl(candidateUrl, helperBaseUrl),
            durationMs: Date.now() - startedAt,
        });
        return {
            ...result,
            checkedUrl: candidateUrl,
            viaProxy: isProxiedUrl(candidateUrl),
            source: candidateSource,
            attemptPath,
        };
    }

    return {
        revoked: false,
        errorCode: lastErrorCode || 'crl_fetch_failed_unknown',
        error: lastError || 'failed to fetch list: unknown error',
        checkedUrl: sourceCandidates[0]?.url || listUrl,
        viaProxy: isProxiedUrl(sourceCandidates[0]?.url || listUrl),
        source: sourceCandidates[0]?.source || 'server',
        attemptPath,
        durationMs: Date.now() - startedAt,
    };
}

function checkRevocationFromBase64(serial, base64Data) {
    if (!serial || typeof serial !== 'string') {
        return { revoked: false, errorCode: 'serial_invalid', error: 'missing or invalid serial' };
    }
    if (!base64Data || typeof base64Data !== 'string') {
        return { revoked: false, errorCode: 'crl_missing_data', error: 'missing CRL data' };
    }
    if (base64Data.length > MAX_CRL_BASE64_LENGTH) {
        return { revoked: false, errorCode: 'crl_too_large', error: 'CRL data too large' };
    }
    try {
        const buffer = decodeBase64ToUint8(base64Data);
        const revokedSet = parseCrlRevokedSerials(buffer);
        const normalizedSerial = serial.trim().toUpperCase();
        return { revoked: revokedSet.has(normalizedSerial), serial: normalizedSerial };
    } catch (e) {
        return {
            revoked: false,
            errorCode: e?.code || 'crl_parse_failed',
            error: `CRL parse error: ${e.message}`,
        };
    }
}

async function checkRevocationBatch(serial, listUrls, options = {}) {
    if (!Array.isArray(listUrls) || listUrls.length === 0) {
        return { revoked: false, serial, results: [], error: 'missing listUrls' };
    }

    const checks = await Promise.all(
        listUrls.map(async (url) => {
            const startedAt = Date.now();
            const result = await checkRevocation(serial, url, options);
            return {
                url,
                revoked: Boolean(result.revoked) === true,
                errorCode: result.errorCode ? String(result.errorCode) : null,
                error: result.error ? String(result.error) : null,
                durationMs: Date.now() - startedAt,
                source: result.source || (result.viaProxy ? 'server-proxy' : 'server'),
                attemptPath: Array.isArray(result.attemptPath) ? result.attemptPath : [],
            };
        }),
    );

    return {
        serial,
        revoked: checks.some((item) => item.revoked),
        results: checks,
    };
}

async function checkRevocationHybridBatch(serial, crlEntries, options = {}) {
    if (!Array.isArray(crlEntries) || crlEntries.length === 0) {
        return { revoked: false, serial, results: [], error: 'missing crlEntries' };
    }

    const checks = await Promise.all(
        crlEntries.map(async (entry) => {
            const url = entry.url || 'unknown';
            const startedAt = Date.now();
            try {
                if (entry.data) {
                    const result = checkRevocationFromBase64(serial, entry.data);
                    return {
                        url,
                        revoked: Boolean(result.revoked) === true,
                        errorCode: result.errorCode ? String(result.errorCode) : null,
                        error: result.error ? String(result.error) : null,
                        durationMs: Date.now() - startedAt,
                        source: 'client',
                    };
                }
                const result = await checkRevocation(serial, url, options);
                return {
                    url,
                    revoked: Boolean(result.revoked) === true,
                    errorCode: result.errorCode ? String(result.errorCode) : null,
                    error: result.error ? String(result.error) : null,
                    durationMs: Date.now() - startedAt,
                    source: result.source || (result.viaProxy ? 'server-proxy' : 'server'),
                    attemptPath: Array.isArray(result.attemptPath) ? result.attemptPath : [],
                };
            } catch (e) {
                return {
                    url,
                    revoked: false,
                    errorCode: 'crl_hybrid_unexpected',
                    error: e?.message || String(e),
                    durationMs: Date.now() - startedAt,
                    source: entry.data ? 'client' : 'server',
                };
            }
        }),
    );

    return {
        serial,
        revoked: checks.some((item) => item.revoked),
        results: checks,
    };
}

export default {
    async fetch(request) {
        try {
            if (request.method === 'OPTIONS') return corsPreflight();

            if (request.method === 'GET') {
                const url = new URL(request.url);
                const serial = url.searchParams.get('serial');
                const listUrl = url.searchParams.get('listUrl');
                const listUrls = url.searchParams.getAll('listUrl');
                const helperBaseUrl =
                    (HELPER_BASE_FROM_ENV && HELPER_BASE_FROM_ENV.trim()) ||
                    url.searchParams.get('helperBaseUrl') ||
                    '';
                const options = { helperBaseUrl };
                const result =
                    listUrls.length > 1
                        ? await checkRevocationBatch(serial, listUrls, options)
                        : await checkRevocation(serial, listUrl, options);
                return jsonResponse(result);
            }

            if (request.method === 'POST') {
                let body;
                try {
                    body = await request.json();
                } catch {
                    return jsonResponse({ revoked: false, error: 'invalid JSON body' }, 400);
                }
                const serial = body.serial || body.certSerial;
                const helperBaseUrl =
                    (HELPER_BASE_FROM_ENV && HELPER_BASE_FROM_ENV.trim()) ||
                    body.helperBaseUrl ||
                    '';
                const options = { helperBaseUrl };

                const crlEntries = Array.isArray(body.crlEntries)
                    ? body.crlEntries.filter(Boolean)
                    : null;
                if (crlEntries && crlEntries.length > 0) {
                    const result = await checkRevocationHybridBatch(serial, crlEntries, options);
                    return jsonResponse(result);
                }

                const listUrl = body.listUrl || body.crlUrl || body.list_url;
                const listUrls = Array.isArray(body.listUrls)
                    ? body.listUrls.filter(Boolean)
                    : null;
                const result =
                    listUrls && listUrls.length > 0
                        ? await checkRevocationBatch(serial, listUrls, options)
                        : await checkRevocation(serial, listUrl, options);
                return jsonResponse(result);
            }

            return jsonResponse({ error: 'Method not allowed' }, 405);
        } catch (err) {
            console.error('[revocation/check] Unhandled error:', err);
            return jsonResponse(
                { revoked: false, error: `Internal server error: ${err?.message || 'unknown'}` },
                500,
            );
        }
    },
};
