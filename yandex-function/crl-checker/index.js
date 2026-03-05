/* global process, Buffer, module */
'use strict';

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
/** Max size of CRL response body to load (avoids OOM; server may omit Content-Length) */
const MAX_CRL_RESPONSE_BYTES = 8 * 1024 * 1024;
const FNS_PREFER_HTTP_HOSTS = new Set(['pki.tax.gov.ru', 'uc.nalog.ru', 'cdp.tax.gov.ru']);
const OPTIONAL_PROXY_BASE = process.env.REVOCATION_PROXY_URL || '';
const LOCAL_HELPER_ALLOWLIST = new Set(['localhost', '127.0.0.1']);
const HELPER_BASE_FROM_ENV = process.env.REVOCATION_LOCAL_HELPER_BASE_URL || '';
const HELPER_PATH = '/helper';

function createError(message, code, details = null) {
    const error = new Error(message);
    error.code = code;
    if (details) error.details = details;
    return error;
}

function json(statusCode, payload, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...CORS_HEADERS,
            ...extraHeaders,
        },
        isBase64Encoded: false,
        body: JSON.stringify(payload),
    };
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

function normalizeHex(hex) {
    const normalized = String(hex || '').replace(/^0+/, '');
    return normalized.length ? normalized : '0';
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
    if (offset >= bytes.length) throw new Error('ASN.1: out of bounds');
    const tag = bytes[offset];
    const lengthInfo = readDerLength(bytes, offset + 1);
    const headerLength = 1 + lengthInfo.byteLength;
    const valueStart = offset + headerLength;
    const valueEnd = valueStart + lengthInfo.length;
    if (valueEnd > bytes.length) throw new Error('ASN.1: invalid length');
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

function decodeBase64ToUint8(base64Data) {
    const sanitized = String(base64Data || '').replace(/\s+/g, '');
    try {
        return new Uint8Array(Buffer.from(sanitized, 'base64'));
    } catch (error) {
        throw createError('Failed to decode base64 payload.', 'crl_decode_failed', {
            reason: error?.message || String(error),
        });
    }
}

function parseCrlRevokedSerials(buffer) {
    let bytes = new Uint8Array(buffer);
    if (bytes.length === 0) throw createError('Empty CRL response.', 'crl_empty');

    const maybeText = new TextDecoder('utf-8').decode(bytes);
    if (maybeText.trimStart().startsWith('<')) {
        const preview = maybeText.slice(0, 200).replace(/\s+/g, ' ');
        throw createError(`Server returned HTML instead of CRL: "${preview}..."`, 'crl_html_response');
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
        throw createError('ASN.1 CRL parsing failed.', 'crl_asn1_failed', {
            reason: error?.message || String(error),
            bytes: bytes.length,
            hexPreview: bytesToHex(bytes.slice(0, 16)),
        });
    }

    const tbs = root.children[0];
    if (!tbs || tbs.tag !== 0x30) {
        throw createError('CRL tbsCertList not found.', 'crl_tbs_not_found');
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

function isPrivateOrLocalHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (LOCAL_HELPER_ALLOWLIST.has(h) || h.endsWith('.localhost')) return true;
    if (/^127\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^169\.254\.|^::1$|^fe80:/i.test(h)) {
        return true;
    }
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

function withOptionalProxy(url) {
    const base = OPTIONAL_PROXY_BASE.trim();
    if (!base) return url;
    const normalizedBase = base.replace(/\/$/, '');
    return `${normalizedBase}?url=${encodeURIComponent(url)}`;
}

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
        if (isGostHost) return [httpUrl, httpsUrl];
        if (parsed.protocol === 'https:') return [httpsUrl, httpUrl];
        return [httpUrl, httpsUrl];
    } catch {
        const candidates = [original];
        if (lower.startsWith('https://')) candidates.push(`http://${original.slice('https://'.length)}`);
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

async function fetchWithRetry(url, attempts = CRL_FETCH_ATTEMPTS, timeoutMs = CRL_FETCH_TIMEOUT_MS) {
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    Accept: 'application/x-x509-crl, application/pkix-crl, application/octet-stream, */*',
                    'User-Agent': 'Copilot-1CO-Revocation-Checker/1.0',
                    'Cache-Control': 'no-cache',
                },
            });
            clearTimeout(timer);
            return response;
        } catch (e) {
            clearTimeout(timer);
            const isAbort = e?.name === 'AbortError' || e?.name === 'TimeoutError';
            lastError = isAbort
                ? createError('timeout', 'crl_fetch_timeout')
                : createError(e?.message || 'fetch failed', 'crl_fetch_network');
            if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
        }
    }
    throw lastError || new Error('fetch failed');
}

async function maybeDecompressGzip(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const ds = new DecompressionStream('gzip');
        return new Response(new Blob([buffer]).stream().pipeThrough(ds)).arrayBuffer();
    }
    return buffer;
}

async function processCrlResponse(buffer, contentType, candidateUrl, normalizedSerial) {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('application/json')) {
        let data;
        try {
            data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer)));
        } catch (e) {
            return { errorCode: 'crl_json_invalid', error: `invalid JSON list (${candidateUrl}): ${e.message}` };
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
            return { errorCode: e?.code || 'crl_parse_failed', error: `CRL parse error (${candidateUrl}): ${e.message}` };
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
    if (!listUrl || typeof listUrl !== 'string') {
        return { revoked: false, errorCode: 'list_url_missing', error: 'missing listUrl' };
    }

    const normalizedSerial = serial.trim().toUpperCase();
    const helperBaseUrl = normalizeHelperBaseUrl(options.helperBaseUrl);
    const sourceCandidates = buildSourceCandidates(listUrl, helperBaseUrl);
    const startedAt = Date.now();
    let lastError = null;
    let lastErrorCode = null;
    const attemptPath = [];

    for (const candidate of sourceCandidates) {
        const candidateUrl = candidate.url;
        const candidateSource = candidate.source;
        if (Date.now() - startedAt > CHECK_REVOCATION_BUDGET_MS) {
            lastError = lastError || `timeout budget exceeded (${CHECK_REVOCATION_BUDGET_MS}ms)`;
            lastErrorCode = lastErrorCode || 'crl_timeout_budget_exceeded';
            break;
        }

        let res;
        try {
            res = await fetchWithRetry(candidateUrl);
        } catch (e) {
            lastError = lastError || `${candidateUrl}: ${e.message}`;
            lastErrorCode = lastErrorCode || e?.code || 'crl_fetch_failed';
            attemptPath.push({ url: candidateUrl, source: candidateSource, errorCode: lastErrorCode });
            continue;
        }

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers?.get?.('location') || '';
            if (location.startsWith('https://')) {
                lastError = lastError || `${candidateUrl}: redirect → HTTPS (GOST TLS unsupported)`;
                lastErrorCode = lastErrorCode || 'crl_redirect_https';
            } else if (location) {
                lastError = lastError || `${candidateUrl}: redirect → ${location}`;
                lastErrorCode = lastErrorCode || 'crl_redirect_other';
            } else {
                lastError = lastError || `${candidateUrl}: redirect ${res.status}`;
                lastErrorCode = lastErrorCode || 'crl_redirect_unknown';
            }
            attemptPath.push({ url: candidateUrl, source: candidateSource, errorCode: lastErrorCode });
            continue;
        }

        if (!res.ok) {
            lastError = lastError || `${candidateUrl}: HTTP ${res.status}`;
            lastErrorCode = lastErrorCode || 'crl_http_error';
            attemptPath.push({ url: candidateUrl, source: candidateSource, errorCode: lastErrorCode });
            continue;
        }

        const contentLength = res.headers?.get?.('Content-Length');
        if (contentLength != null) {
            const len = parseInt(contentLength, 10);
            if (!Number.isNaN(len) && len > MAX_CRL_RESPONSE_BYTES) {
                lastError = lastError || `${candidateUrl}: CRL too large (${len} bytes, max ${MAX_CRL_RESPONSE_BYTES})`;
                lastErrorCode = lastErrorCode || 'crl_too_large';
                attemptPath.push({ url: candidateUrl, source: candidateSource, errorCode: lastErrorCode });
                continue;
            }
        }

        const contentType = (res.headers?.get?.('Content-Type') || '').toLowerCase();
        const buffer = await res.arrayBuffer();
        const result = await processCrlResponse(buffer, contentType, candidateUrl, normalizedSerial);
        if (result.error) {
            lastError = lastError || result.error;
            lastErrorCode = lastErrorCode || result.errorCode || 'crl_processing_failed';
            attemptPath.push({ url: candidateUrl, source: candidateSource, errorCode: lastErrorCode });
            continue;
        }

        return {
            ...result,
            checkedUrl: candidateUrl,
            source: candidateSource,
            viaProxy: isProxiedUrl(candidateUrl),
            attemptPath,
        };
    }

    return {
        revoked: false,
        errorCode: lastErrorCode || 'crl_fetch_failed_unknown',
        error: lastError || 'failed to fetch list: unknown error',
        checkedUrl: sourceCandidates[0]?.url || listUrl,
        source: sourceCandidates[0]?.source || 'server',
        viaProxy: isProxiedUrl(sourceCandidates[0]?.url || listUrl),
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
                source: result.source || 'server',
                attemptPath: Array.isArray(result.attemptPath) ? result.attemptPath : [],
            };
        }),
    );
    return { serial, revoked: checks.some((item) => item.revoked), results: checks };
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
                    source: result.source || 'server',
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
    return { serial, revoked: checks.some((item) => item.revoked), results: checks };
}

/**
 * Normalizes incoming event so that path/method work with or without function-ID prefix
 * and with API Gateway-style requestContext (e.g. requestContext.http.method/path).
 * Paths like /d4ek2is78822funrr85b/api/health are normalized to /api/health.
 */
function normalizeEvent(event) {
    if (!event || typeof event !== 'object') {
        return {
            httpMethod: 'GET',
            path: '/',
            queryStringParameters: {},
            multiValueQueryStringParameters: {},
            body: null,
            isBase64Encoded: false,
        };
    }
    const ctx = event.requestContext || {};
    const http = ctx.http || ctx.request?.http || {};
    let method = (http.method || event.httpMethod || 'GET').toUpperCase();
    let path = String(http.path || event.path || '/').trim() || '/';
    // Strip leading /{functionId} segment when path is /{id}/api/... or /{id}/health
    const prefixMatch = path.match(/^\/[a-zA-Z0-9-]+(?=\/(?:api\/|health))/);
    if (prefixMatch) {
        path = path.slice(prefixMatch[0].length);
    }
    return {
        httpMethod: method,
        path,
        queryStringParameters: event.queryStringParameters || {},
        multiValueQueryStringParameters: event.multiValueQueryStringParameters || {},
        body: event.body,
        isBase64Encoded: Boolean(event.isBase64Encoded),
    };
}

function parseEventBody(event) {
    if (!event || event.body == null) return null;
    const b = event.body;
    if (typeof b === 'object') {
        return JSON.stringify(b);
    }
    return event.isBase64Encoded
        ? Buffer.from(String(b), 'base64').toString('utf-8')
        : String(b);
}

function getQueryMulti(event, key) {
    const multi = event?.multiValueQueryStringParameters?.[key];
    if (Array.isArray(multi)) return multi.filter(Boolean);
    const single = event?.queryStringParameters?.[key];
    return single ? [single] : [];
}

function isHealthRoute(event) {
    const method = String(event?.httpMethod || 'GET').toUpperCase();
    const path = String(event?.path || '/');
    if (path === '/api/health' || path === '/health') return true;
    if (path === '/' && method === 'GET') {
        const serial = event?.queryStringParameters?.serial;
        const listUrl = event?.queryStringParameters?.listUrl;
        return !serial && !listUrl;
    }
    return false;
}

module.exports.handler = async function handler(event) {
    let ev;
    try {
        ev = normalizeEvent(event);
    } catch (normErr) {
        return json(500, {
            revoked: false,
            error: `Request normalization failed: ${normErr?.message || 'unknown'}`,
        });
    }
    try {
        const method = ev.httpMethod;

        if (method === 'OPTIONS') {
            return {
                statusCode: 204,
                headers: CORS_HEADERS,
                isBase64Encoded: false,
                body: '',
            };
        }

        if (isHealthRoute(ev)) {
            return json(200, { ok: true, service: 'copilot-1co-revocation', yandexCloud: true });
        }

        if (method === 'GET') {
            const serial = ev?.queryStringParameters?.serial || null;
            const listUrl = ev?.queryStringParameters?.listUrl || null;
            const listUrls = getQueryMulti(ev, 'listUrl');
            const helperBaseUrl = HELPER_BASE_FROM_ENV || ev?.queryStringParameters?.helperBaseUrl || '';
            const options = { helperBaseUrl };
            const result =
                listUrls.length > 1
                    ? await checkRevocationBatch(serial, listUrls, options)
                    : await checkRevocation(serial, listUrl, options);
            return json(200, result);
        }

        if (method === 'POST') {
            const rawBody = parseEventBody(ev);
            let body = null;
            try {
                body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
                return json(400, { revoked: false, error: 'invalid JSON body' });
            }

            const serial = body.serial || body.certSerial;
            const helperBaseUrl = HELPER_BASE_FROM_ENV || body.helperBaseUrl || '';
            const options = { helperBaseUrl };

            const crlEntries = Array.isArray(body.crlEntries) ? body.crlEntries.filter(Boolean) : null;
            if (crlEntries && crlEntries.length > 0) {
                const result = await checkRevocationHybridBatch(serial, crlEntries, options);
                return json(200, result);
            }

            const listUrl = body.listUrl || body.crlUrl || body.list_url;
            const listUrls = Array.isArray(body.listUrls) ? body.listUrls.filter(Boolean) : null;
            const result =
                listUrls && listUrls.length > 0
                    ? await checkRevocationBatch(serial, listUrls, options)
                    : await checkRevocation(serial, listUrl, options);
            return json(200, result);
        }

        return json(405, { error: 'Method not allowed' });
    } catch (err) {
        const msg = (err && typeof err.message === 'string') ? err.message : 'unknown';
        return json(500, { revoked: false, error: `Internal server error: ${msg}` });
    }
};
