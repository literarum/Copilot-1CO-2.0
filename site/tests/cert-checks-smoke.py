import asyncio
from playwright.async_api import async_playwright

TEST_CERT_PEM = """-----BEGIN CERTIFICATE-----
MIIBkTCB+6ADAgECAhQ4q6RmDj+kf4IieeoVSeh5M/J8nTAKBggqhQMHAQEDAjAQ
MQ4wDAYDVQQDDAVUZXN0Q0EwHhcNMjYwMjExMDAwMDAwWhcNMjYwMjEyMDAwMDAw
WjAQMQ4wDAYDVQQDDAVUZXN0Q0EwZjAfBggqhQMHAQEBATATBgcqhQMCAiMABggq
hQMHAQECAgNDAARAdwNQkth2mY7kUz+9jW95w9MReFl6f9fHqv7Lx3I5Qx6m8zN9
u9d3k8A3uL5yA6aEdLPcfcL4h4aVB2U8i4QwCgYIKoUDBwEBAwIDQQBsl1m5J4h0
h3Wk8k6gQmWQ7Kz7MzQJQf3jZ9KVfX3xVJQfZ3r6p6S9XhX2pNnG5jI9N2H8Y4uS
2Y1g6xvD7JfD
-----END CERTIFICATE-----"""

TEST_CERT_BASE64_ONLY = """MIIBkTCB+6ADAgECAhQ4q6RmDj+kf4IieeoVSeh5M/J8nTAKBggqhQMHAQEDAjAQ
MQ4wDAYDVQQDDAVUZXN0Q0EwHhcNMjYwMjExMDAwMDAwWhcNMjYwMjEyMDAwMDAw
WjAQMQ4wDAYDVQQDDAVUZXN0Q0EwZjAfBggqhQMHAQEBATATBgcqhQMCAiMABggq
hQMHAQECAgNDAARAdwNQkth2mY7kUz+9jW95w9MReFl6f9fHqv7Lx3I5Qx6m8zN9
u9d3k8A3uL5yA6aEdLPcfcL4h4aVB2U8i4QwCgYIKoUDBwEBAwIDQQBsl1m5J4h0
h3Wk8k6gQmWQ7Kz7MzQJQf3jZ9KVfX3xVJQfZ3r6p6S9XhX2pNnG5jI9N2H8Y4uS
2Y1g6xvD7JfD"""


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        page_errors = []
        console_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on(
            "console",
            lambda m: console_errors.append(m.text)
            if m.type == "error" and "[certChecks]" in m.text
            else None,
        )

        await page.goto("http://127.0.0.1:4173", wait_until="load")
        await page.wait_for_timeout(7000)
        await page.evaluate(
            """() => {
                document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
                document.getElementById('certChecksContent')?.classList.remove('hidden');
            }"""
        )

        async def run_case(file_name: str, payload: str):
            await page.set_input_files(
                "#certFileInput",
                {
                    "name": file_name,
                    "mimeType": "application/pkix-cert",
                    "buffer": payload.encode("utf-8"),
                },
            )

            await page.wait_for_timeout(400)
            drop_hidden = await page.locator("#certDropZone").evaluate(
                "el => el.classList.contains('hidden')"
            )
            loaded_visible = await page.locator("#certLoadedState").is_visible()

            await page.click("#runCertChecksBtn")
            await page.wait_for_timeout(1200)
            summary = await page.locator("#certChecksSummary").inner_text()

            assert drop_hidden, f"Drop-zone should be hidden after file selection: {file_name}"
            assert loaded_visible, f"Loaded-state banner should be visible: {file_name}"
            assert (
                "Ошибка проверки сертификата" not in summary
            ), f"Validation ended with generic parse error: {file_name}; summary={summary}"

        await run_case("test-cert.cer", TEST_CERT_PEM)

        await page.click("#clearCertChecksBtn")
        await page.wait_for_timeout(200)

        # Проверяем base64-only .cer (без BEGIN/END)
        await run_case("test-base64-only.cer", TEST_CERT_BASE64_ONLY)

        await browser.close()

        assert len(page_errors) == 0, f"Page errors found: {page_errors}"
        assert len(console_errors) == 0, f"Console cert errors found: {console_errors}"

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
