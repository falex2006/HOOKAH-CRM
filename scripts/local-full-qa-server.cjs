'use strict';
const fs = require('node:fs');
const path = require('node:path');
const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tmp', 'full-local-qa/runtime.json'), 'utf8'));
if (c.database !== 'hookah_local_qa' || c.dbPort !== 31930 || c.appPort !== 31932 || !c.dbUser || !c.dbPassword || !c.password || !c.appKey) throw new Error('Only the dedicated local QA config is accepted');
const manifestFile = path.join(__dirname, '..', 'tmp', 'full-local-qa/seed-manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
Object.assign(process.env, {
  HOST: '127.0.0.1', PORT: String(c.appPort), NODE_ENV: 'test', AUTH_REQUIRED: 'true', DEMO_MODE: 'false',
  DATABASE_URL: `postgresql://${encodeURIComponent(c.dbUser)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.dbPort}/${c.database}`,
  SAAS_OWNER_EMAIL: c.platformLogin, SAAS_OWNER_PASSWORD: c.password,
  STAFF_PASSPORT_KEY: c.appKey, SESSION_SECRET: c.appKey
});
if (manifest.primaryVenueId) process.env.VENUE_ID = manifest.primaryVenueId;
require('../server.js');
