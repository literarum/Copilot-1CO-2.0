import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('yandex crl-checker handler', () => {
    it('returns health payload for /api/health', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const result = await handler(
            {
                httpMethod: 'GET',
                path: '/api/health',
                headers: {},
                queryStringParameters: {},
                multiValueQueryStringParameters: {},
            },
            {},
        );

        expect(result.statusCode).toBe(200);
        expect(result.headers['Content-Type']).toContain('application/json');
        expect(JSON.parse(result.body)).toEqual(
            expect.objectContaining({
                ok: true,
                service: 'copilot-1co-revocation',
            }),
        );
    });

    it('handles OPTIONS preflight with CORS headers', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const result = await handler(
            {
                httpMethod: 'OPTIONS',
                path: '/api/revocation/check',
                headers: {},
                queryStringParameters: {},
                multiValueQueryStringParameters: {},
            },
            {},
        );

        expect(result.statusCode).toBe(204);
        expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
        expect(result.headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
    });

    it('uses http candidate first for FNS hosts', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]), {
                status: 200,
                headers: { 'Content-Type': 'application/pkix-crl' },
            }),
        );

        const result = await handler(
            {
                httpMethod: 'POST',
                path: '/api/revocation/check',
                headers: { 'content-type': 'application/json' },
                queryStringParameters: {},
                multiValueQueryStringParameters: {},
                body: JSON.stringify({
                    serial: '01AB',
                    listUrl: 'https://pki.tax.gov.ru/cdp/test.crl',
                }),
                isBase64Encoded: false,
            },
            {},
        );

        const payload = JSON.parse(result.body);
        expect(result.statusCode).toBe(200);
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(fetchMock.mock.calls[0][0]).toBe('http://pki.tax.gov.ru/cdp/test.crl');
        expect(payload.error).toContain('CRL parse error');
    });
});
