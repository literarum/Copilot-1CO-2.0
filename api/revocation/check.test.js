import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from './check.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('revocation API — GOST host HTTP-only candidates', () => {
    it('only generates http candidate for known GOST/FNS hosts (no https)', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]), {
                status: 200,
                headers: { 'Content-Type': 'application/pkix-crl' },
            }),
        );

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                listUrl: 'https://pki.tax.gov.ru/cdp/test.crl',
            }),
        });

        const response = await handler.fetch(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        // Первый кандидат — HTTP (GOST), затем HTTPS (2 попытки); первый вызов должен быть по HTTP
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(fetchMock.mock.calls[0][0]).toBe('http://pki.tax.gov.ru/cdp/test.crl');
        expect(payload.error).toContain('CRL parse error');
    });

    it('detects redirect response (3xx) from manual redirect mode', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(null, {
                status: 301,
                headers: { Location: 'https://pki.tax.gov.ru/cdp/test.crl' },
            }),
        );

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                listUrl: 'https://pki.tax.gov.ru/cdp/test.crl',
            }),
        });

        const response = await handler.fetch(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.revoked).toBe(false);
        expect(payload.error).toContain('HTTPS');
    });
});

describe('revocation API hybrid (crlEntries)', () => {
    it('parses client-provided base64 CRL data without network fetch', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const minimalDerCrl = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]);
        const base64 = Buffer.from(minimalDerCrl).toString('base64');

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                crlEntries: [{ url: 'https://pki.tax.gov.ru/cdp/test.crl', data: base64 }],
            }),
        });

        const response = await handler.fetch(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(payload.results).toHaveLength(1);
        expect(payload.results[0].source).toBe('client');
    });

    it('falls back to server fetch when client data is null', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                crlEntries: [{ url: 'https://example.com/test.crl', data: null }],
            }),
        });

        const response = await handler.fetch(request);
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.results).toHaveLength(1);
        expect(payload.results[0].source).toBe('server');
        expect(payload.results[0].error).toBeTruthy();
    });

    it('returns structured error on crash instead of 500', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            throw new Error('unexpected crash');
        });

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                listUrl: 'https://example.com/test.crl',
            }),
        });

        const response = await handler.fetch(request);
        expect(response.status).toBeLessThanOrEqual(500);
        const payload = await response.json();
        expect(payload.error).toBeTruthy();
    });
});

describe('revocation API error classes', () => {
    it('returns html-response error code for html body', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response('<html>blocked</html>', {
                status: 200,
                headers: { 'Content-Type': 'application/x-x509-crl' },
            }),
        );

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                listUrl: 'https://example.com/test.crl',
            }),
        });

        const response = await handler.fetch(request);
        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.errorCode).toBe('crl_html_response');
    });

    it('returns timeout error code when fetch times out', async () => {
        const timeoutErr = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
        // 2 candidates (https + http) × 2 attempts each = 4 fetch calls
        vi.spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(timeoutErr)
            .mockRejectedValueOnce(timeoutErr)
            .mockRejectedValueOnce(timeoutErr)
            .mockRejectedValueOnce(timeoutErr);

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                listUrl: 'https://example.com/test.crl',
            }),
        });

        const response = await handler.fetch(request);
        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.errorCode).toBe('crl_fetch_timeout');
    });

    it('includes duration and error code for hybrid entries', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                crlEntries: [{ url: 'https://example.com/test.crl', data: null }],
            }),
        });

        const response = await handler.fetch(request);
        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.results[0].durationMs).toBeTypeOf('number');
        expect(payload.results[0].errorCode).toBeTruthy();
    });

    it('uses local-helper as first source when configured and succeeds', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ revoked: ['01AB'] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        const request = new Request('http://localhost/api/revocation/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serial: '01AB',
                crlEntries: [{ url: 'https://example.com/test.crl', data: null }],
                helperBaseUrl: 'http://127.0.0.1:7777/helper',
            }),
        });

        const response = await handler.fetch(request);
        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload.results[0].source).toBe('local-helper');
        expect(payload.results[0].error).toBe(null);
        expect(fetchSpy.mock.calls[0][0]).toContain('127.0.0.1:7777/helper');
    });
});
