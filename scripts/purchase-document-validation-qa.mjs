import assert from 'node:assert/strict';
import validation from '../purchase-document-validation.js';

const dataUrl = (mimeType, bytes) => `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
const validFiles = [
  ['image/png', [137,80,78,71,13,10,26,10,0]],
  ['image/jpeg', [255,216,255,0]],
  ['image/webp', [82,73,70,70,0,0,0,0,87,69,66,80]],
  ['application/pdf', Buffer.from('%PDF-1.7\n')],
];

assert.deepEqual(validation.SUPPORTED_TYPES, ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
assert.equal(validation.MAX_BYTES, 1_400_000);
assert.equal(validation.validateDataUrl('').valid, true, 'supporting document remains optional');
for (const [mimeType, signature] of validFiles) {
  const result = validation.validateDataUrl(dataUrl(mimeType, signature));
  assert.equal(result.valid, true, `${mimeType} signature is accepted`);
  assert.equal(result.mimeType, mimeType);
  assert.equal(result.byteLength, signature.length);
  assert.equal(validation.validateFile({ type: mimeType, size: signature.length }).valid, true);
}

assert.equal(validation.validateFile({ type: 'image/svg+xml', size: 100 }).error, 'unsupported_purchase_payment_document_type');
assert.equal(validation.validateFile({ type: 'application/pdf', size: 1_400_001 }).error, 'purchase_payment_document_too_large');
assert.equal(validation.validateFile({ type: 'application/pdf', size: 0 }).error, 'invalid_purchase_payment_document');

for (const invalid of [
  null,
  {},
  'https://example.test/receipt.pdf',
  'data:image/svg+xml;base64,PHN2Zz4=',
  'data:application/pdf;base64,SGVsbG8=',
  'data:image/png;base64,JVBERi0xLjQ=',
  'data:image/png;base64,%%%=',
  'data:image/png;base64,AAAA',
  'data:image/png;base64,iVBORw0KGgo=\n',
]) assert.equal(validation.validateDataUrl(invalid).valid, false, `invalid data URL rejected: ${String(invalid).slice(0, 60)}`);

const oversizedPdf = Buffer.alloc(validation.MAX_BYTES + 1);
Buffer.from('%PDF-').copy(oversizedPdf);
assert.equal(validation.validateDataUrl(dataUrl('application/pdf', oversizedPdf)).error, 'purchase_payment_document_too_large');

console.log('PURCHASE DOCUMENT VALIDATION QA: PASS (4 supported signatures, optional file, malformed data URLs, MIME mismatch, unsupported/oversized files)');
