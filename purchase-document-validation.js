(function exposePurchaseDocumentValidation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PurchaseDocumentValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPurchaseDocumentValidation() {
  const MAX_BYTES = 1_400_000;
  const SUPPORTED_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
  const dataUrlPattern = /^data:(image\/png|image\/jpeg|image\/webp|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/i;

  const failure = (error) => ({ valid: false, error });
  const validateFile = (file) => {
    if (!file || typeof file !== 'object') return failure('invalid_purchase_payment_document');
    if (!SUPPORTED_TYPES.includes(String(file.type || '').toLowerCase())) return failure('unsupported_purchase_payment_document_type');
    if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) return failure('invalid_purchase_payment_document');
    if (Number(file.size) > MAX_BYTES) return failure('purchase_payment_document_too_large');
    return { valid: true, mimeType: String(file.type).toLowerCase(), byteLength: Number(file.size) };
  };

  const decodeBase64 = (encoded) => {
    if (encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null;
    try {
      if (typeof Buffer !== 'undefined') {
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.toString('base64') !== encoded) return null;
        return bytes;
      }
      if (typeof atob === 'function') {
        const decoded = atob(encoded);
        if (btoa(decoded) !== encoded) return null;
        return decoded;
      }
    } catch { return null; }
    return null;
  };

  const hasExpectedSignature = (mimeType, bytes) => {
    const byteAt = (index) => typeof bytes === 'string' ? bytes.charCodeAt(index) : bytes[index];
    if (mimeType === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => byteAt(index) === value);
    if (mimeType === 'image/jpeg') return bytes.length >= 3 && byteAt(0) === 0xff && byteAt(1) === 0xd8 && byteAt(2) === 0xff;
    if (mimeType === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...[0,1,2,3,8,9,10,11].map(byteAt)) === 'RIFFWEBP';
    if (mimeType === 'application/pdf') return bytes.length >= 5 && String.fromCharCode(...[0,1,2,3,4].map(byteAt)) === '%PDF-';
    return false;
  };

  const validateDataUrl = (value) => {
    if (value === '') return { valid: true, mimeType: '', byteLength: 0 };
    if (typeof value !== 'string') return failure('invalid_purchase_payment_document');
    const match = dataUrlPattern.exec(value);
    if (!match) return failure('invalid_purchase_payment_document');
    const mimeType = match[1].toLowerCase();
    const bytes = decodeBase64(match[2]);
    if (!bytes || bytes.length === 0 || !hasExpectedSignature(mimeType, bytes)) return failure('invalid_purchase_payment_document');
    if (bytes.length > MAX_BYTES) return failure('purchase_payment_document_too_large');
    return { valid: true, mimeType, byteLength: bytes.length };
  };

  return Object.freeze({ MAX_BYTES, SUPPORTED_TYPES, validateFile, validateDataUrl });
});
