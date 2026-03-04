/* Simple CRL helper proxy.
 * Purpose: fetch CRL over HTTP/HTTPS from FNS/other hosts and return raw bytes.
 * Run: node helper/crl-helper.js
 * For use from browser (localhost): CORS enabled; only FNS CRL hosts allowed (SSRF protection).
 */

const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 7777;
const HOST = process.env.HOST || '0.0.0.0';

const FNS_CRL_ALLOWED_HOSTS = new Set(['pki.tax.gov.ru', 'cdp.tax.gov.ru', 'uc.nalog.ru']);
const UPSTREAM_FETCH_TIMEOUT_MS = 25000;

// #region agent log
function sendAgentDebugLog(payload) {
    try {
        fetch('http://127.0.0.1:7520/ingest/374fe693-b6e8-47c0-81cf-9d56349887e0', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd2ebc4' },
            body: JSON.stringify({ sessionId: 'd2ebc4', ...payload, timestamp: Date.now() }),
        }).catch(() => {});
    } catch {
        // ignore debug transport errors
    }
}
// #endregion

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

function setCors(res) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
        res.setHeader(k, v);
    }
}

function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    setCors(res);
    res.end(body);
}

function isAllowedCrlHost(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;
    const h = hostname.toLowerCase().replace(/^\[.*\]$/, '');
    return FNS_CRL_ALLOWED_HOSTS.has(h);
}

const server = http.createServer(async (req, res) => {
    setCors(res);

    try {
        const reqUrl = new URL(req.url, `http://${req.headers.host}`);

        if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
        }

        if (reqUrl.pathname === '/' || reqUrl.pathname === '/health') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (reqUrl.pathname !== '/helper') {
            res.statusCode = 404;
            res.end('Not found');
            return;
        }

        const target = reqUrl.searchParams.get('url') || '';
        // #region agent log
        sendAgentDebugLog({
            hypothesisId: 'H1_H5',
            location: 'crl-helper.js:helper:request',
            message: 'Helper received request',
            data: { method: req.method, pathname: reqUrl.pathname, hasTarget: !!target },
        });
        // #endregion
        if (!target) {
            return sendJson(res, 400, { error: 'missing url parameter' });
        }

        let targetUrl;
        try {
            targetUrl = new URL(target);
        } catch {
            return sendJson(res, 400, { error: 'invalid url parameter' });
        }

        if (!['http:', 'https:'].includes(targetUrl.protocol)) {
            return sendJson(res, 400, { error: 'unsupported protocol, only http/https allowed' });
        }

        if (!isAllowedCrlHost(targetUrl.hostname)) {
            return sendJson(res, 400, {
                error: 'host not allowed (only FNS CRL hosts: pki.tax.gov.ru, cdp.tax.gov.ru, uc.nalog.ru)',
            });
        }

        // Варианты URL для ФНС: сначала HTTP, затем HTTPS (как на сервере).
        const host = targetUrl.hostname.toLowerCase();
        const pathAndSearch = `${targetUrl.pathname || ''}${targetUrl.search || ''}`;
        const httpUrl = `http://${host}${pathAndSearch}`;
        const httpsUrl = `https://${host}${pathAndSearch}`;
        const candidateUrls =
            FNS_CRL_ALLOWED_HOSTS.has(host) && targetUrl.protocol === 'https:'
                ? [httpUrl, httpsUrl]
                : [targetUrl.toString()];

        // #region agent log
        sendAgentDebugLog({
            hypothesisId: 'H_HELPER_CANDIDATES',
            location: 'crl-helper.js:helper:before-upstream',
            message: 'Helper upstream candidates',
            data: { original: target, candidates: candidateUrls },
        });
        // #endregion

        let lastError = null;
        let lastStatus = 0;
        let lastContentType = 'application/octet-stream';
        let lastBuffer = null;

        for (let i = 0; i < candidateUrls.length; i++) {
            const candidateUrl = candidateUrls[i];
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_FETCH_TIMEOUT_MS);
            let upstream;
            try {
                upstream = await fetch(candidateUrl, {
                    method: 'GET',
                    redirect: 'manual',
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);

                // #region agent log
                sendAgentDebugLog({
                    hypothesisId: 'H_HELPER_FETCH',
                    location: 'crl-helper.js:helper:after-upstream',
                    message: 'Upstream CRL response',
                    data: { candidateUrl, status: upstream.status, ok: upstream.ok },
                });
                // #endregion

                if (!upstream.ok) {
                    lastStatus = upstream.status;
                    lastContentType =
                        upstream.headers.get('Content-Type') || 'application/json; charset=utf-8';
                    lastBuffer = Buffer.from(
                        JSON.stringify({ error: `HTTP ${upstream.status}` }),
                        'utf-8',
                    );
                    lastError = new Error(`HTTP ${upstream.status}`);
                    continue;
                }

                const arrayBuffer = await upstream.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                res.statusCode = upstream.status;
                res.setHeader(
                    'Content-Type',
                    upstream.headers.get('Content-Type') || 'application/octet-stream',
                );
                res.setHeader('Content-Length', buffer.length);
                res.end(buffer);
                return;
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                lastError = fetchErr;
                // #region agent log
                sendAgentDebugLog({
                    hypothesisId: 'H_HELPER_FETCH',
                    location: 'crl-helper.js:helper:fetch-error',
                    message: 'Upstream fetch error',
                    data: {
                        candidateUrl,
                        attemptIndex: i,
                        errorName: fetchErr?.name,
                        errorMessage: fetchErr?.message || String(fetchErr),
                    },
                });
                // #endregion
                continue;
            }
        }

        if (lastError) {
            if (lastError?.name === 'AbortError' && !res.headersSent) {
                return sendJson(res, 504, { error: 'upstream timeout', code: 'crl_fetch_timeout' });
            }
            if (!res.headersSent) {
                const status = lastStatus || 502;
                res.statusCode = status;
                res.setHeader('Content-Type', lastContentType);
                if (lastBuffer) {
                    res.setHeader('Content-Length', lastBuffer.length);
                    res.end(lastBuffer);
                } else {
                    sendJson(res, status, { error: lastError.message || String(lastError) });
                }
                return;
            }
        }
    } catch (error) {
        // #region agent log
        sendAgentDebugLog({
            hypothesisId: 'H2_H5',
            location: 'crl-helper.js:helper:catch',
            message: 'Helper upstream error',
            data: { errorName: error?.name, errorMessage: error?.message || String(error) },
        });
        // #endregion
        console.error('[crl-helper] error:', error);
        if (!res.headersSent) {
            sendJson(res, 500, { error: error.message || String(error) });
        } else {
            res.end();
        }
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[crl-helper] listening on http://${HOST}:${PORT}/helper?url=<CRL_URL>`);
});
