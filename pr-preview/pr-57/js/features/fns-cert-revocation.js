'use strict';

import { REVOCATION_API_BASE_URL } from '../config.js';

const DEFAULT_FNS_CRL_URLS = [
    'https://crl.nalog.ru/cdp/guc2024.crl',
    'https://crl.nalog.ru/cdp/guc2025.crl',
];

const OID_LABELS = {
    '2.5.4.3': 'CN',
    '2.5.4.6': 'C',
    '2.5.4.7': 'L',
    '2.5.4.8': 'ST',
    '2.5.4.10': 'O',
    '2.5.4.11': 'OU',
    '1.2.643.100.1': 'ОГРН',
    '1.2.643.100.3': 'СНИЛС',
    '1.2.643.3.131.1.1': 'ИНН',
};

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

function decodePemToDer(text) {
    const base64 = text
        .replace(/-----BEGIN[^-]+-----/g, '')
        .replace(/-----END[^-]+-----/g, '')
        .replace(/\s+/g, '');
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
}

function readDerLength(bytes, offset) {
    const first = bytes[offset];
    if (first < 0x80) {
        return { length: first, byteLength: 1 };
    }
    const numBytes = first & 0x7f;
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
        length = (length << 8) | bytes[offset + 1 + i];
    }
    return { length, byteLength: 1 + numBytes };
}

function parseDerNode(bytes, offset = 0) {
    if (offset >= bytes.length) {
        throw new Error('ASN.1: выход за пределы буфера');
    }
    const tag = bytes[offset];
    const lengthInfo = readDerLength(bytes, offset + 1);
    const headerLength = 1 + lengthInfo.byteLength;
    const valueStart = offset + headerLength;
    const valueEnd = valueStart + lengthInfo.length;

    if (valueEnd > bytes.length) {
        throw new Error('ASN.1: некорректная длина');
    }

    const node = {
        tag,
        length: lengthInfo.length,
        start: offset,
        end: valueEnd,
        valueStart,
        valueEnd,
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

function decodeOid(bytes) {
    if (!bytes.length) return '';
    const first = bytes[0];
    const firstPart = Math.floor(first / 40);
    const secondPart = first % 40;
    let oid = `${firstPart}.${secondPart}`;
    let value = 0;
    for (let i = 1; i < bytes.length; i++) {
        value = (value << 7) | (bytes[i] & 0x7f);
        if ((bytes[i] & 0x80) === 0) {
            oid += `.${value}`;
            value = 0;
        }
    }
    return oid;
}

function decodeDerString(node, bytes) {
    const valueBytes = bytes.slice(node.valueStart, node.valueEnd);
    switch (node.tag) {
        case 0x0c:
        case 0x13:
        case 0x16:
        case 0x1a:
            return new TextDecoder('utf-8').decode(valueBytes);
        case 0x1e: {
            const view = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.length);
            let result = '';
            for (let i = 0; i < view.byteLength; i += 2) {
                result += String.fromCharCode(view.getUint16(i));
            }
            return result;
        }
        default:
            return bytesToHex(valueBytes);
    }
}

function decodeTime(node, bytes) {
    const text = new TextDecoder('ascii').decode(bytes.slice(node.valueStart, node.valueEnd));
    const trimmed = text.replace(/Z$/, '');
    if (node.tag === 0x17 && trimmed.length >= 12) {
        const year = parseInt(trimmed.slice(0, 2), 10);
        const fullYear = year < 50 ? 2000 + year : 1900 + year;
        const month = parseInt(trimmed.slice(2, 4), 10) - 1;
        const day = parseInt(trimmed.slice(4, 6), 10);
        const hour = parseInt(trimmed.slice(6, 8), 10);
        const minute = parseInt(trimmed.slice(8, 10), 10);
        const second = parseInt(trimmed.slice(10, 12), 10);
        return new Date(Date.UTC(fullYear, month, day, hour, minute, second)).toLocaleString();
    }
    if (node.tag === 0x18 && trimmed.length >= 14) {
        const fullYear = parseInt(trimmed.slice(0, 4), 10);
        const month = parseInt(trimmed.slice(4, 6), 10) - 1;
        const day = parseInt(trimmed.slice(6, 8), 10);
        const hour = parseInt(trimmed.slice(8, 10), 10);
        const minute = parseInt(trimmed.slice(10, 12), 10);
        const second = parseInt(trimmed.slice(12, 14), 10);
        return new Date(Date.UTC(fullYear, month, day, hour, minute, second)).toLocaleString();
    }
    return text;
}

function parseName(node, bytes) {
    if (!node || node.tag !== 0x30) return '—';
    const parts = [];
    node.children.forEach((setNode) => {
        if (setNode.tag !== 0x31) return;
        setNode.children.forEach((seqNode) => {
            if (seqNode.tag !== 0x30 || seqNode.children.length < 2) return;
            const oidNode = seqNode.children[0];
            const valueNode = seqNode.children[1];
            const oid = decodeOid(bytes.slice(oidNode.valueStart, oidNode.valueEnd));
            const label = OID_LABELS[oid] || oid;
            const value = decodeDerString(valueNode, bytes);
            parts.push(`${label}=${value}`);
        });
    });
    return parts.length ? parts.join(', ') : '—';
}

function parseCertificate(buffer) {
    let bytes = new Uint8Array(buffer);
    const maybeText = new TextDecoder('utf-8').decode(bytes);
    if (maybeText.includes('BEGIN CERTIFICATE')) {
        bytes = decodePemToDer(maybeText);
    }

    const root = parseDerNode(bytes);
    const tbs = root.children[0];
    if (!tbs || tbs.tag !== 0x30) {
        throw new Error('Не удалось прочитать сертификат.');
    }

    const tbsChildren = tbs.children;
    let cursor = 0;
    if (tbsChildren[0]?.tag === 0xa0) {
        cursor += 1;
    }

    const serialNode = tbsChildren[cursor];
    const signatureNode = tbsChildren[cursor + 1];
    const issuerNode = tbsChildren[cursor + 2];
    const validityNode = tbsChildren[cursor + 3];
    const subjectNode = tbsChildren[cursor + 4];

    const serialHex = bytesToHex(bytes.slice(serialNode.valueStart, serialNode.valueEnd));
    const validityChildren = validityNode?.children || [];
    const notBefore = validityChildren[0] ? decodeTime(validityChildren[0], bytes) : '—';
    const notAfter = validityChildren[1] ? decodeTime(validityChildren[1], bytes) : '—';

    return {
        serialHex,
        serialNormalized: normalizeHex(serialHex),
        issuer: parseName(issuerNode, bytes),
        subject: parseName(subjectNode, bytes),
        signature: signatureNode?.tag === 0x30 ? 'X.509' : '—',
        notBefore,
        notAfter,
    };
}

function parseCrl(buffer) {
    let bytes = new Uint8Array(buffer);
    const maybeText = new TextDecoder('utf-8').decode(bytes);
    if (maybeText.includes('BEGIN X509 CRL')) {
        bytes = decodePemToDer(maybeText);
    }

    const root = parseDerNode(bytes);
    const tbs = root.children[0];
    if (!tbs || tbs.tag !== 0x30) {
        throw new Error('Не удалось прочитать CRL.');
    }

    const tbsChildren = tbs.children;
    let cursor = 0;
    if (tbsChildren[0]?.tag === 0x02 && tbsChildren[1]?.tag === 0x30) {
        cursor += 1;
    }

    const issuerNode = tbsChildren[cursor + 1];
    const thisUpdateNode = tbsChildren[cursor + 2];
    let nextUpdateNode = null;
    let revokedNode = null;

    const possibleNextNode = tbsChildren[cursor + 3];
    if (possibleNextNode && (possibleNextNode.tag === 0x17 || possibleNextNode.tag === 0x18)) {
        nextUpdateNode = possibleNextNode;
        revokedNode = tbsChildren[cursor + 4];
    } else {
        revokedNode = possibleNextNode;
    }

    if (revokedNode && revokedNode.tag !== 0x30) {
        revokedNode = null;
    }

    const revokedSerials = new Map();
    if (revokedNode && Array.isArray(revokedNode.children)) {
        revokedNode.children.forEach((entry) => {
            if (!entry.children || entry.children.length < 2) return;
            const serialNode = entry.children[0];
            const dateNode = entry.children[1];
            if (serialNode.tag !== 0x02) return;
            const serialHex = bytesToHex(bytes.slice(serialNode.valueStart, serialNode.valueEnd));
            revokedSerials.set(normalizeHex(serialHex), decodeTime(dateNode, bytes));
        });
    }

    return {
        issuer: parseName(issuerNode, bytes),
        thisUpdate: thisUpdateNode ? decodeTime(thisUpdateNode, bytes) : '—',
        nextUpdate: nextUpdateNode ? decodeTime(nextUpdateNode, bytes) : '—',
        revokedSerials,
    };
}

function createStatusElement(text, tone = 'neutral') {
    const el = document.createElement('div');
    const toneClasses = {
        neutral: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200',
        success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-200',
        warn: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200',
        danger: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-200',
    };
    el.className = `rounded-md border p-3 text-sm ${toneClasses[tone] || toneClasses.neutral}`;
    el.textContent = text;
    return el;
}

export function initFNSCertificateRevocationSystem() {
    const certInput = document.getElementById('fnsCertFileInput');
    const certInfo = document.getElementById('fnsCertInfo');
    const dropZone = document.getElementById('fnsCertDropZone');
    const resetBtn = document.getElementById('fnsCertResetBtn');

    if (!certInput || !certInfo || !resetBtn) {
        console.warn('[FNS Cert Revocation] Не найдены элементы интерфейса.');
        return;
    }

    const setInfo = (text, tone = 'neutral') => {
        certInfo.textContent = text;
        certInfo.className = 'mt-2 block text-xs';
        if (tone === 'success') certInfo.classList.add('text-green-600', 'dark:text-green-400');
        else if (tone === 'warn') certInfo.classList.add('text-yellow-600', 'dark:text-yellow-400');
        else if (tone === 'danger') certInfo.classList.add('text-red-600', 'dark:text-red-400');
        else certInfo.classList.add('text-gray-500', 'dark:text-gray-400');
    };

    const validateFile = async (file) => {
        if (!file) {
            setInfo('Сертификат не выбран.', 'neutral');
            return;
        }

        try {
            setInfo(`Проверка ${file.name}...`, 'neutral');
            const certBuffer = await file.arrayBuffer();
            const certInfoData = parseCertificate(certBuffer);
            const apiBase =
                typeof REVOCATION_API_BASE_URL === 'string' && REVOCATION_API_BASE_URL.trim()
                    ? REVOCATION_API_BASE_URL.trim().replace(/\/$/, '')
                    : '';

            if (!apiBase) {
                setInfo('Сервис проверки недоступен: не настроен API.', 'danger');
                return;
            }

            let revoked = false;
            let checked = 0;
            for (const url of DEFAULT_FNS_CRL_URLS) {
                try {
                    const response = await fetch(`${apiBase}/api/revocation/check`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ serial: certInfoData.serialNormalized, listUrl: url }),
                    });
                    const result = await response.json().catch(() => ({}));
                    if (response.ok && !result.error) {
                        checked += 1;
                        if (result.revoked) revoked = true;
                    }
                } catch (_) {}
            }

            if (!checked) {
                setInfo('Не удалось проверить сертификат по CRL ФНС.', 'warn');
                return;
            }

            if (revoked) {
                setInfo(`Сертификат ${file.name} отозван.`, 'danger');
            } else {
                setInfo(`Сертификат ${file.name} не найден в списках отзыва.`, 'success');
            }
        } catch (error) {
            setInfo(`Ошибка проверки: ${error.message}`, 'danger');
        }
    };

    certInput.addEventListener('change', () => validateFile(certInput.files?.[0]));

    if (dropZone) {
        dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            dropZone.classList.add('border-primary');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-primary');
        });
        dropZone.addEventListener('drop', async (event) => {
            event.preventDefault();
            dropZone.classList.remove('border-primary');
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            const dt = new DataTransfer();
            dt.items.add(file);
            certInput.files = dt.files;
            await validateFile(file);
        });
    }

    resetBtn.addEventListener('click', () => {
        certInput.value = '';
        setInfo('Сертификат не выбран.', 'neutral');
    });

    setInfo('Сертификат не выбран.', 'neutral');
}

window.initFNSCertificateRevocationSystem = initFNSCertificateRevocationSystem;
