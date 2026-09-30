import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('function normalizeTaskDeadline(input)');
const end=source.indexOf('\nconst root =',start);
assert.ok(start>0 && end>start);
const normalize=new Function(`${source.slice(start,end)};return normalizeTaskDeadline;`)();
assert.deepEqual(normalize({status:'done'}),{changed:false});
for(const input of [{dueAt:null},{dueDate:''},{dueDate:null,dueAt:''}]) assert.deepEqual(normalize(input),{changed:true,dueDate:null,dueAt:null});
for(const day of ['2026-09-29','2024-02-29','0001-01-01']) {
  for(const field of ['dueDate','dueAt']) assert.deepEqual(normalize({[field]:day}),{changed:true,dueDate:day,dueAt:null});
}
for(const day of ['2026-02-29','2026-02-31','2026-13-01','0000-01-01','2026-00-01','2026-01-00','29.09.2026',123]) assert.equal(normalize({dueDate:day}).error,'invalid_task_due_date');
for(const stamp of ['2026-09-29T00:00:00Z','2026-09-29T15:30:00.123456+05:00','2026-09-29T23:59:59-07:00']) assert.deepEqual(normalize({dueAt:stamp}),{changed:true,dueDate:null,dueAt:stamp});
for(const stamp of ['2026-02-31T15:00:00Z','2026-09-29T24:00:00Z','2026-09-29T15:60:00Z','2026-09-29T15:00:60Z','2026-09-29T15:00:00','2026-09-29T15:00:00+24:00','bad',123]) assert.equal(normalize({dueAt:stamp}).error,'invalid_task_due_at');
assert.equal(normalize({dueDate:'2026-09-29',dueAt:'2026-09-29T00:00:00Z'}).error,'invalid_task_deadline');
console.log('TASK DEADLINE NORMALIZATION QA: PASS (calendar, precise legacy time, clearing, omitted field, conflicts and invalid dates)');
