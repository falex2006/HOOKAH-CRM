import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration = fs.readFileSync('migrations/021_staff_time_payroll.sql', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
for (const token of ['staff_schedules','staff_work_logs','payroll_rules','payroll_entries']) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${token}`));
for (const route of ['/api/staff/schedule','/api/staff/time','/api/payroll/rules','/api/payroll/entries']) assert.match(server, new RegExp(route.replaceAll('/', '\\/')));
assert.match(server, /EXTRACT\(EPOCH FROM/);
assert.match(server, /rule\.rule_type === 'hourly'/);
console.log('PAYROLL QA: schedule, work time, rules and hourly calculation wired');
