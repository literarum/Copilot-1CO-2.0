/**
 * Cloudflare Worker: API проверки отзыва сертификатов
 * Эндпоинт: POST /api/revocation/check (совместим с локальным Python-сервером 127.0.0.1:8765)
 * Поддерживает: JSON/текстовые списки отзыва и бинарный X.509 CRL (в т.ч. ФНС).
 * CORS разрешён для GitHub Pages и localhost.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...headers },
  });
}

function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// --- Минимальный разбор DER/CRL для извлечения отозванных серийных номеров ---
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

function parseDerNode(bytes, offset) {
  if (offset >= bytes.length) throw new Error('ASN.1: выход за пределы буфера');
  const tag = bytes[offset];
  const lengthInfo = readDerLength(bytes, offset + 1);
  const headerLength = 1 + lengthInfo.byteLength;
  const valueStart = offset + headerLength;
  const valueEnd = valueStart + lengthInfo.length;
  if (valueEnd > bytes.length) throw new Error('ASN.1: некорректная длина');
  const node = { tag, length: lengthInfo.length, valueStart, valueEnd, end: valueEnd, children: [] };
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
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function normalizeHex(hex) {
  const normalized = hex.replace(/^0+/, '');
  return normalized.length ? normalized : '0';
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

/** Из бинарного CRL (DER или PEM) извлекает Set нормализованных серийных номеров. */
function parseCrlRevokedSerials(buffer) {
  let bytes = new Uint8Array(buffer);
  const maybeText = new TextDecoder('utf-8').decode(bytes);
  if (maybeText.includes('BEGIN X509 CRL')) {
    const base64 = maybeText
      .replace(/-----BEGIN[^-]+-----/g, '')
      .replace(/-----END[^-]+-----/g, '')
      .replace(/\s+/g, '');
    const raw = atob(base64);
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  }

  const root = parseDerNode(bytes);
  const tbs = root.children[0];
  if (!tbs || tbs.tag !== 0x30) throw new Error('Не удалось прочитать CRL.');

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

/**
 * Проверка отзыва: запрашивает listUrl, парсит как CRL или JSON/текст, проверяет serial.
 */
async function checkRevocation(serial, listUrl) {
  if (!serial || typeof serial !== 'string') {
    return { revoked: false, error: 'missing or invalid serial' };
  }
  const normalizedSerial = serial.trim().toUpperCase();
  if (!listUrl || typeof listUrl !== 'string') {
    return { revoked: false, error: 'missing listUrl' };
  }

  let res;
  try {
    res = await fetch(listUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json, application/x-x509-crl, application/pkix-crl, text/plain, */*' },
    });
  } catch (e) {
    return { revoked: false, error: `failed to fetch list: ${e.message}` };
  }

  if (!res.ok) {
    return { revoked: false, error: `list URL returned ${res.status}` };
  }

  const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
  let revoked = false;

  if (contentType.includes('application/json')) {
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.revoked || data.serials || data.list || []);
    revoked = list.some((item) => {
      const s = typeof item === 'string' ? item : (item.serial || item);
      return String(s).trim().toUpperCase() === normalizedSerial;
    });
  } else if (
    contentType.includes('x509-crl') ||
    contentType.includes('pkix-crl') ||
    contentType.includes('octet-stream') ||
    listUrl.toLowerCase().endsWith('.crl') ||
    !contentType.includes('text')
  ) {
    const buffer = await res.arrayBuffer();
    try {
      const revokedSet = parseCrlRevokedSerials(buffer);
      revoked = revokedSet.has(normalizedSerial);
    } catch (e) {
      return { revoked: false, error: `CRL parse error: ${e.message}` };
    }
  } else {
    const text = await res.text();
    const lines = text.split(/\r?\n/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    revoked = lines.includes(normalizedSerial);
  }

  return { revoked, serial: normalizedSerial };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return corsPreflight();

    if (url.pathname === '/api/revocation/check' || url.pathname === '/api/revocation/check/') {
      if (request.method === 'GET') {
        const serial = url.searchParams.get('serial');
        const listUrl = url.searchParams.get('listUrl');
        const result = await checkRevocation(serial, listUrl);
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
        const listUrl = body.listUrl || body.crlUrl || body.list_url;
        const result = await checkRevocation(serial, listUrl);
        return jsonResponse(result);
      }
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/api/health' || url.pathname === '/') {
      return jsonResponse({ ok: true, service: 'copilot-1co-revocation' });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
