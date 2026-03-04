# Raw Base64 Certificate Parsing Fix

**Date:** 2026-02-27
**Status:** Approved

## Problem

`parseCertificate()` in `site/js/features/fns-cert-revocation.js` fails on `.cer` files that contain raw Base64-encoded DER without PEM headers. This is a common format from Russian CAs (e.g. FNS, KryptoPro).

The parser handles DER (binary) and PEM (`-----BEGIN CERTIFICATE-----` wrapper) but not raw Base64 — the third common `.cer` format.

## Root Cause

`parseCertificate()` checks for PEM headers. When absent, it treats the buffer as raw DER. But raw Base64 text is neither valid DER nor PEM, causing the ASN.1 parser to fail.

## Solution

Add raw Base64 detection in `parseCertificate()` between the PEM check and the DER parse. If the decoded text (after trim) matches `/^[A-Za-z0-9+/=\s]+$/` and is longer than 100 characters, decode it via `atob()` to binary DER.

Detection order:

1. Text contains `BEGIN CERTIFICATE` → PEM path (existing)
2. Text is pure Base64 chars, length > 100 → raw Base64 → `atob()` → DER
3. Otherwise → treat as raw DER binary (existing)

## Scope

- One file: `site/js/features/fns-cert-revocation.js`
- One function: `parseCertificate()`
- ~6 lines of new code
- No new dependencies
