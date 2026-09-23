import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 3218;
const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), AUTH_REQUIRED: 'false', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const raw = async (path, body) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 800); child.once('error', reject); child.once('exit', (code) => code && reject(new Error(`server exited ${code}`))); });
  const bot = await raw('/api/login', JSON.stringify({ username: 'robot', password: 'bad', website: 'filled-by-bot' }));
  assert.equal(bot.status, 400); assert.equal((await bot.json()).error, 'bot_detected');
  const oversized = await raw('/api/login', JSON.stringify({ username: 'x', password: 'x', padding: 'x'.repeat(2 * 1024 * 1024) }));
  assert.equal(oversized.status, 413);
  console.log('SECURITY QA: honeypot and payload limit passed');
} finally { child.kill('SIGTERM'); }
