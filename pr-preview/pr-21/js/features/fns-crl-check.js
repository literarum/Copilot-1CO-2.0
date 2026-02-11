'use strict';

function bytesToHex(bytes) {
    return Array.from(bytes || [], (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function normalizeHex(hex) {
    return String(hex || '').replace(/[^a-fA-F0-9]/g, '').replace(/^0+/, '').toUpperCase();
}

function readAsTextSafe(bytes) {
    try {
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
        return new TextDecoder().decode(bytes);
    }
}

function pemToDer(text) {
    const b64 = text
        .replace(/-----BEGIN[^-]+-----/g, '')
        .replace(/-----END[^-]+-----/g, '')
        .replace(/\s+/g, '');
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

function parseAsn1Element(bytes, offset = 0) {
    if (offset >= bytes.length) throw new Error('ASN.1: offset out of bounds');
    const tag = bytes[offset];
    const lenByte = bytes[offset + 1];
    if (lenByte === undefined) throw new Error('ASN.1: missing length');

    let length = 0;
    let headerLen = 2;
    if ((lenByte & 0x80) === 0) {
        length = lenByte;
    } else {
        const count = lenByte & 0x7f;
        if (count === 0 || count > 4) throw new Error('ASN.1: unsupported length');
        headerLen += count;
        for (let i = 0; i < count; i++) {
            const b = bytes[offset + 2 + i];
            if (b === undefined) throw new Error('ASN.1: malformed long length');
            length = (length << 8) | b;
        }
    }

    const valueStart = offset + headerLen;
    const valueEnd = valueStart + length;
    if (valueEnd > bytes.length) throw new Error('ASN.1: length exceeds buffer');

    return {
        tag,
        offset,
        headerLen,
        length,
        valueStart,
        valueEnd,
        constructed: (tag & 0x20) === 0x20,
    };
}

function readChildren(bytes, element) {
    const children = [];
    let pos = element.valueStart;
    while (pos < element.valueEnd) {
        const child = parseAsn1Element(bytes, pos);
        children.push(child);
        pos = child.valueEnd;
    }
    return children;
}

function extractSerialAndCrlUrls(certBytes) {
    const root = parseAsn1Element(certBytes, 0);
    const rootChildren = readChildren(certBytes, root);
    if (!rootChildren[0] || rootChildren[0].tag !== 0x30) throw new Error('Некорректный X.509');

    const tbs = rootChildren[0];
    const tbsChildren = readChildren(certBytes, tbs);

    let serialEl = tbsChildren[0];
    if (serialEl?.tag === 0xa0) {
        serialEl = tbsChildren[1];
    }
    if (!serialEl || serialEl.tag !== 0x02) throw new Error('Не удалось извлечь serialNumber');

    const serialHex = bytesToHex(certBytes.slice(serialEl.valueStart, serialEl.valueEnd));

    const crlUrls = new Set();
    const crlOid = [0x55, 0x1d, 0x1f];

    for (const child of tbsChildren) {
        if (child.tag !== 0xa3) continue;
        const extContainerChildren = readChildren(certBytes, child);
        const extSequence = extContainerChildren[0];
        if (!extSequence || extSequence.tag !== 0x30) continue;
        const extItems = readChildren(certBytes, extSequence);

        for (const extItem of extItems) {
            if (extItem.tag !== 0x30) continue;
            const fields = readChildren(certBytes, extItem);
            const oidEl = fields.find((f) => f.tag === 0x06);
            const octetEl = fields.find((f) => f.tag === 0x04);
            if (!oidEl || !octetEl) continue;

            const oidRaw = Array.from(certBytes.slice(oidEl.valueStart, oidEl.valueEnd));
            if (oidRaw.length !== crlOid.length || !oidRaw.every((b, i) => b === crlOid[i])) continue;

            const extValue = certBytes.slice(octetEl.valueStart, octetEl.valueEnd);
            const txt = readAsTextSafe(extValue);
            const matches = txt.match(/https?:\/\/[^\s\x00"<>]+/gi) || [];
            matches.forEach((u) => crlUrls.add(u.replace(/[),.;]+$/, '')));
        }
    }

    return { serialHex: normalizeHex(serialHex), crlUrls: Array.from(crlUrls) };
}

function extractRevokedSerials(crlBytes) {
    const root = parseAsn1Element(crlBytes, 0);
    const rootChildren = readChildren(crlBytes, root);
    if (!rootChildren[0] || rootChildren[0].tag !== 0x30) throw new Error('Некорректный CRL');

    const tbs = rootChildren[0];
    const tbsChildren = readChildren(crlBytes, tbs);

    let revokedSeq = null;
    for (const child of tbsChildren) {
        if (child.tag !== 0x30) continue;
        const entries = readChildren(crlBytes, child);
        if (entries.length && entries.every((e) => e.tag === 0x30)) {
            const firstEntryChildren = readChildren(crlBytes, entries[0]);
            if (firstEntryChildren[0]?.tag === 0x02) {
                revokedSeq = child;
                break;
            }
        }
    }

    if (!revokedSeq) return [];

    const revokedEntries = readChildren(crlBytes, revokedSeq);
    const serials = [];
    for (const entry of revokedEntries) {
        const entryFields = readChildren(crlBytes, entry);
        const serialField = entryFields[0];
        if (serialField?.tag === 0x02) {
            serials.push(normalizeHex(bytesToHex(crlBytes.slice(serialField.valueStart, serialField.valueEnd))));
        }
    }

    return serials;
}

async function readCertificateFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const text = readAsTextSafe(bytes);

    if (text.includes('BEGIN CERTIFICATE')) {
        return pemToDer(text);
    }

    return bytes;
}

export function initFnsCrlChecker() {
    const fileInput = document.getElementById('fnsCrlCertFile');
    const manualUrlInput = document.getElementById('fnsCrlManualUrl');
    const checkBtn = document.getElementById('fnsCrlCheckBtn');
    const clearBtn = document.getElementById('fnsCrlClearBtn');
    const status = document.getElementById('fnsCrlStatus');
    const result = document.getElementById('fnsCrlResult');
    const logEl = document.getElementById('fnsCrlLog');

    if (!fileInput || !checkBtn || !clearBtn || !status || !result || !logEl) {
        return;
    }

    const log = (msg) => {
        logEl.textContent += `${new Date().toLocaleTimeString()} — ${msg}\n`;
    };

    const setResult = (ok, title, details = '') => {
        result.classList.remove('hidden', 'border-green-300', 'bg-green-50', 'text-green-800', 'border-red-300', 'bg-red-50', 'text-red-800', 'border-yellow-300', 'bg-yellow-50', 'text-yellow-800');
        if (ok === true) {
            result.classList.add('border-green-300', 'bg-green-50', 'text-green-800');
        } else if (ok === false) {
            result.classList.add('border-red-300', 'bg-red-50', 'text-red-800');
        } else {
            result.classList.add('border-yellow-300', 'bg-yellow-50', 'text-yellow-800');
        }
        result.innerHTML = `<div class="font-semibold">${title}</div>${details ? `<div class="mt-1">${details}</div>` : ''}`;
    };

    checkBtn.addEventListener('click', async () => {
        logEl.textContent = '';
        result.classList.add('hidden');

        const file = fileInput.files?.[0];
        if (!file) {
            status.textContent = 'Выберите файл сертификата.';
            setResult(null, 'Нет файла сертификата');
            return;
        }

        try {
            status.textContent = 'Чтение сертификата...';
            log(`Файл: ${file.name}, размер ${file.size} байт`);
            const certDer = await readCertificateFile(file);

            status.textContent = 'Анализ сертификата...';
            const { serialHex, crlUrls } = extractSerialAndCrlUrls(certDer);
            log(`Серийный номер: ${serialHex || 'не найден'}`);

            const manualUrl = (manualUrlInput.value || '').trim();
            const urls = [...crlUrls, ...(manualUrl ? [manualUrl] : [])].filter(Boolean);

            if (!urls.length) {
                status.textContent = 'Не найдены CRL URL в сертификате.';
                setResult(null, 'Не удалось найти CRL URL', 'Добавьте ссылку вручную и повторите проверку.');
                return;
            }

            log(`Найдено CRL URL: ${urls.length}`);
            let checkedAny = false;

            for (const url of urls) {
                try {
                    status.textContent = `Проверка CRL: ${url}`;
                    log(`Загрузка CRL: ${url}`);
                    const response = await fetch(url, { method: 'GET' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const crlData = new Uint8Array(await response.arrayBuffer());
                    const revoked = extractRevokedSerials(crlData);
                    log(`Записей об отзыве в CRL: ${revoked.length}`);
                    checkedAny = true;

                    const isRevoked = revoked.includes(serialHex);
                    if (isRevoked) {
                        status.textContent = 'Сертификат отозван.';
                        setResult(false, 'Сертификат отозван', `Источник: ${url}`);
                        return;
                    }
                } catch (err) {
                    log(`Ошибка CRL ${url}: ${err.message}`);
                }
            }

            if (checkedAny) {
                status.textContent = 'Проверка завершена: сертификат не найден в списках отзыва.';
                setResult(true, 'Сертификат не найден в CRL', 'Проверено по доступным спискам отзыва.');
            } else {
                status.textContent = 'Не удалось проверить CRL (часто это CORS/недоступность URL).';
                setResult(null, 'Проверка не завершена', 'Не удалось загрузить CRL напрямую из браузера.');
            }
        } catch (error) {
            status.textContent = 'Ошибка проверки сертификата.';
            log(`Критическая ошибка: ${error.message}`);
            setResult(null, 'Ошибка проверки', error.message);
        }
    });

    clearBtn.addEventListener('click', () => {
        fileInput.value = '';
        manualUrlInput.value = '';
        logEl.textContent = '';
        status.textContent = 'Загрузите сертификат и запустите проверку.';
        result.classList.add('hidden');
    });
}
