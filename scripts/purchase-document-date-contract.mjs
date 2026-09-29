import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server.js', 'utf8');
const portal = fs.readFileSync('portal.js', 'utf8');
const repository = fs.readFileSync('db.js', 'utf8');
const migration = fs.readFileSync('migrations/047_purchase_document_date_optional.sql', 'utf8');

assert.match(migration, /ALTER COLUMN document_date DROP DEFAULT[\s\S]*ALTER COLUMN document_date DROP NOT NULL/,
  'forward migration makes unknown supplier dates nullable without rewriting historical data');
assert.match(server, /const rawDocumentDate = input\.documentDate === undefined \|\| input\.documentDate === null[\s\S]*const documentDate = rawDocumentDate \|\| null/,
  'API normalizes empty dates to NULL and does not invent the current date');
assert.match(portal, /id="purchase-date" type="date"/);
assert.doesNotMatch(portal.match(/<label>Дата накладной · необязательно([\s\S]*?)<\/label>/)?.[1] || '', /required/,
  'supplier invoice date is optional in the browser form');
assert.match(portal, /Дата накладной не указана/,
  'unknown invoice date has an explicit display label');
assert.match(repository, /ORDER BY d\.document_date DESC NULLS LAST,d\.recorded_at DESC/,
  'dated purchase records sort chronologically and unknown dates do not masquerade as a day');
console.log('PURCHASE DOCUMENT DATE CONTRACT: PASS (optional NULL date, separate system timestamp, explicit display, NULLS LAST)');
