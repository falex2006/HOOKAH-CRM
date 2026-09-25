import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.codex/team/team.json'), 'utf8'));
const roleDir = path.join(root, '.codex/team/roles');
const files = fs.readdirSync(roleDir).filter((name) => name.endsWith('.md')).sort();
const ids = manifest.roles.map((role) => role.id);
const required = 15;
if (manifest.roles.length !== required || files.length !== required) throw new Error(`Expected ${required} roles, got manifest=${manifest.roles.length}, files=${files.length}`);
if (new Set(ids).size !== required) throw new Error('Role IDs must be unique');
for (const id of ids) { if (!fs.existsSync(path.join(roleDir, `${id}.md`))) throw new Error(`Missing role profile: ${id}`); }
const architect = manifest.roles.find((role) => role.id === 'system_architect');
const architectProfile = fs.readFileSync(path.join(roleDir, 'system_architect.md'), 'utf8');
const teamGuide = fs.readFileSync(path.join(root, 'docs/AI_TEAM.md'), 'utf8');
const workflow = fs.readFileSync(path.join(root, 'docs/AI_TEAM_WORKFLOW.md'), 'utf8');
if (!/API–интерфейс/.test(architect.mission) || !/назначенный интегратор между backend\/API, frontend/.test(architectProfile)) throw new Error('System architect must own the API–UI integration contract');
if (!/Сквозная ответственность API и интерфейса закреплена за системным архитектором/.test(teamGuide)) throw new Error('Team guide must name the API–UI integration owner');
if (!/Владелец сквозной интеграции UI–API/.test(workflow) || !/QA — рабочий сквозной сценарий/.test(workflow)) throw new Error('Team workflow must require end-to-end UI–API verification');
for (const file of ['docs/AI_TEAM.md','docs/AI_TEAM_WORKFLOW.md','AGENTS.md','docs/ai-team/DECISIONS.md','docs/ai-team/WORK_LOG.md']) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing team artifact: ${file}`);
if (manifest.execution.max_parallel_runtime_agents < 1) throw new Error('Parallel runtime limit must be positive');
console.log(`AI TEAM CONTRACT: PASS (${required} roles, ${manifest.execution.max_parallel_runtime_agents} parallel runtime agents)`);
