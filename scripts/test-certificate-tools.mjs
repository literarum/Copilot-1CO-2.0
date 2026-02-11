import assert from 'node:assert/strict';
import {
  normalizeCertificateInput,
  checkRevocationStatus,
} from '../site/js/features/certificate-tools.js';

const encoder = new TextEncoder();

function derSample() {
  return new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]);
}

const der = derSample();
const derRes = normalizeCertificateInput(der);
assert.equal(derRes.ok, true);
assert.equal(derRes.sourceFormat, 'der');

const b64 = Buffer.from(der).toString('base64');
const b64Res = normalizeCertificateInput(encoder.encode(b64));
assert.equal(b64Res.ok, true);
assert.equal(b64Res.sourceFormat, 'base64');

const pem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
const pemRes = normalizeCertificateInput(encoder.encode(pem));
assert.equal(pemRes.ok, true);
assert.equal(pemRes.sourceFormat, 'pem');

const wrong = normalizeCertificateInput(encoder.encode('not a cert'));
assert.equal(wrong.ok, false);

const emulated = await checkRevocationStatus({
  serialNumberHex: '01AB',
  ocspUrls: [],
  crlUrls: [],
  endpoint: '',
});
assert.equal(emulated.source, 'emulator');
assert.equal(emulated.status, 'unknown');

console.log('certificate-tools tests passed');
