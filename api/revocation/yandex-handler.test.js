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

    it('returns health for path with function-ID prefix (normalized path)', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const result = await handler(
            {
                httpMethod: 'GET',
                path: '/d4ek2is78822funrr85b/api/health',
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

    it('returns 204 + CORS for OPTIONS with path containing function-ID prefix', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const result = await handler(
            {
                httpMethod: 'OPTIONS',
                path: '/d4ek2is78822funrr85b/api/revocation/check',
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

    it('returns health when event uses requestContext.http (API Gateway style)', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const result = await handler(
            {
                requestContext: {
                    http: {
                        method: 'GET',
                        path: '/api/health',
                    },
                },
                queryStringParameters: {},
                multiValueQueryStringParameters: {},
            },
            {},
        );

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body).ok).toBe(true);
    });

    it('accepts POST with event.body as object (API Gateway may pass parsed JSON)', async () => {
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
                queryStringParameters: {},
                multiValueQueryStringParameters: {},
                body: { serial: '01AB', listUrl: 'https://pki.tax.gov.ru/cdp/test.crl' },
                isBase64Encoded: false,
            },
            {},
        );
        expect(result.statusCode).toBe(200);
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
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

    it('normalizes serial values when JSON list omits leading zeroes', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ revoked: ['AB'] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
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
                    serial: '00ab',
                    listUrl: 'https://example.com/revoked.json',
                }),
                isBase64Encoded: false,
            },
            {},
        );

        const payload = JSON.parse(result.body);
        expect(result.statusCode).toBe(200);
        expect(payload.revoked).toBe(true);
    });

    it('follows relative same-host redirect chain before parsing CRL/text payload', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: { Location: '/DDoS01/a035fbd8/cdp/test.crl' },
                }),
            )
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: { Location: '/cdp/final-list.txt' },
                }),
            )
            .mockResolvedValueOnce(
                new Response('AB\nFFFF\n', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
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
                    serial: 'AB',
                    listUrl: 'https://cdp.tax.gov.ru/cdp/test.crl',
                }),
                isBase64Encoded: false,
            },
            {},
        );

        const payload = JSON.parse(result.body);
        expect(result.statusCode).toBe(200);
        expect(payload.revoked).toBe(true);
        expect(fetchMock.mock.calls[0][0]).toBe('http://cdp.tax.gov.ru/cdp/test.crl');
    });

    it('falls back from cdp host to pki mirror when cdp is unreachable', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ revoked: ['AB'] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
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
                    serial: 'AB',
                    listUrl: 'https://cdp.tax.gov.ru/cdp/test.crl',
                }),
                isBase64Encoded: false,
            },
            {},
        );

        const payload = JSON.parse(result.body);
        expect(result.statusCode).toBe(200);
        expect(payload.revoked).toBe(true);
        expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
            'http://cdp.tax.gov.ru/cdp/test.crl',
            'http://cdp.tax.gov.ru/cdp/test.crl',
            'https://cdp.tax.gov.ru/cdp/test.crl',
            'https://cdp.tax.gov.ru/cdp/test.crl',
            'http://pki.tax.gov.ru/cdp/test.crl',
        ]);
    });

    it('falls back to pki mirror when DDoS redirect URL returns 404', async () => {
        const { handler } = require('../../yandex-function/crl-checker/index.js');
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: { Location: '/DDoS01/ec79425a/cdp/test.crl' },
                }),
            )
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 404,
                }),
            )
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ revoked: ['AB'] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
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
                    serial: 'AB',
                    listUrl: 'https://cdp.tax.gov.ru/cdp/test.crl',
                }),
                isBase64Encoded: false,
            },
            {},
        );

        const payload = JSON.parse(result.body);
        expect(result.statusCode).toBe(200);
        expect(payload.revoked).toBe(true);
        expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
            'http://cdp.tax.gov.ru/cdp/test.crl',
            'http://cdp.tax.gov.ru/DDoS01/ec79425a/cdp/test.crl',
            'https://cdp.tax.gov.ru/cdp/test.crl',
            'https://cdp.tax.gov.ru/cdp/test.crl',
            'http://pki.tax.gov.ru/cdp/test.crl',
        ]);
    });
});
