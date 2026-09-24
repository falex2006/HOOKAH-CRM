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
for (const file of ['docs/AI_TEAM.md','docs/AI_TEAM_WORKFLOW.md','AGENTS.md','docs/ai-team/DECISIONS.md','docs/ai-team/WORK_LOG.md']) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing team artifact: ${file}`);
if (manifest.execution.max_parallel_runtime_agents < 1) throw new Error('Parallel runtime limit must be positive');
console.log(`AI TEAM CONTRACT: PASS (${required} roles, ${manifest.execution.max_parallel_runtime_agents} parallel runtime agents)`);
