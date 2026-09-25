import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../migrations/038_inventory_purchase_documents.sql', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../db.js', import.meta.url), 'utf8');

for (const field of [
  'OLD.document_id IS DISTINCT FROM NEW.document_id',
  'OLD.venue_id IS DISTINCT FROM NEW.venue_id',
  'OLD.receipt_unit_cost IS DISTINCT FROM NEW.receipt_unit_cost',
  'OLD.source_movement_id IS DISTINCT FROM NEW.source_movement_id'
]) assert.match(migration, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

assert.match(migration, /source_movement_id uuid UNIQUE REFERENCES stock_movements\(id\) ON DELETE RESTRICT/);
assert.match(migration, /inventory_purchase_line_scope_guard/);
assert.match(migration, /inventory_purchase_line_lifecycle_guard/);
assert.match(migration, /BEFORE INSERT OR UPDATE OF source_auto_order_id, venue_id ON inventory_purchase_documents/);
assert.match(migration, /WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END\s+FOR UPDATE/,
  'line writes must lock their parent document and serialize with posting');
assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE ON inventory_purchase_document_lines/,
  'every line mutation must be rejected after posting');
assert.doesNotMatch(migration, /OLD\.status = 'posted' AND NEW\.status = 'voided'/,
  'posted receipts cannot be voided until reversing movements exist');
for (const route of [
  "'/api/inventory/purchase-documents' && req.method === 'GET'",
  "'/api/inventory/purchase-documents' && req.method === 'POST'",
  "purchaseDocumentPath && req.method === 'PATCH'",
  "purchaseDocumentPostPath && req.method === 'POST'"
]) assert.match(server, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const contract of ['purchase_document_not_postable', 'purchase_document_empty', 'source_movement_id', 'stock_movements', 'receipt_unit_cost', 'inventory.purchase_document_posted', 'invalid_source_auto_order', 'FOR UPDATE OF l,i']) assert.match(`${server}\n${repository}`, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
console.log('PURCHASE DOCUMENTS CONTRACT: PASS');
