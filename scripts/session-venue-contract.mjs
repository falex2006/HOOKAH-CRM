import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('../db.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/030_auth_session_active_venue.sql', import.meta.url), 'utf8');

assert.match(server, /let defaultVenueDbId =/);
assert.match(server, /let venueDbId = defaultVenueDbId/);
assert.match(server, /requestAuthToken/);
assert.match(server, /sessionRepository\.setActiveVenue\(hashToken\(token\), selected\.id\)/);
assert.match(db, /active_venue_id/);
assert.match(db, /async setActiveVenue\(tokenHash, venueId\)/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS active_venue_id uuid/);

console.log('SESSION VENUE CONTRACT: PASS (active venue is stored per session)');
