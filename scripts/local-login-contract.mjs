import fs from 'node:fs';
const html = fs.readFileSync('login.html', 'utf8');
const distHtml = fs.readFileSync('dist/login.html', 'utf8');
const distDirectoryHtml = fs.readFileSync('dist/login/index.html', 'utf8');
const js = fs.readFileSync('login.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const profile = fs.readFileSync('staff-profile.js', 'utf8');
const lock = fs.readFileSync('lock.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const required = [
  ['password toggle', html.includes('login-password-toggle') && js.includes('passwordToggle')],
  ['idle hookah scene', html.includes('login-atmosphere') && html.includes('login-hookah')],
  ['real hookah photo', fs.existsSync('assets/login-hookah-reference.jpg') && css.includes('login-hookah-reference.jpg')],
  ['login state hook', js.includes('setLoginState')],
  ['transition layer', js.includes('showLoginTransition')],
  ['skip control', css.includes('login-transition__skip')],
  ['transition completion', js.includes('showLoginTransition') && js.includes('resolve()')],
  ['reduced motion', css.includes('@media(prefers-reduced-motion:reduce)')],
  ['bowl animation', css.includes('@keyframes bowlRise')],
  ['tobacco animation', css.includes('@keyframes tobaccoDrop')],
  ['metal animation', css.includes('@keyframes metalDrop')],
  ['coal animation', css.includes('@keyframes coalGlow')],
  ['smoke animation', css.includes('@keyframes smokeRise') && css.includes('@keyframes loginSmoke')],
  ['failure collapse', css.includes('@keyframes loginCollapse')],
  ['screen lock PIN mode', lock.includes('PIN') && lock.includes('pin')],
  ['PIN validation', profile.includes('staff-profile-pin') && profile.includes('\\\\d{4}')],
  ['self-service PIN settings', profile.includes('staff-profile-pin') && profile.includes('__syncStaffPin')],
  ['login is the safe default when setup status is unavailable', /if \(form && setupForm\) \{ form\.hidden = false; setupForm\.hidden = true; \}/.test(js) && !/response\.status === 404[\s\S]*setupForm\.hidden = false/.test(js)],
  ['login is visible before JavaScript runs', /id="login-form"(?![^>]*\shidden)/.test(html)],
  ['first-run form is hidden before JavaScript runs', /id="setup-form"\s+hidden/.test(html)],
  ['login password input is identified as an existing password', /id="login-password"[^>]*autocomplete="current-password"/.test(html)],
  ['published flat login route keeps the safe initial state', /id="login-form"(?![^>]*\shidden)/.test(distHtml) && /id="setup-form"\s+hidden/.test(distHtml)],
  ['published /login/ directory alias matches the safe initial state', /id="login-form"(?![^>]*\shidden)/.test(distDirectoryHtml) && /id="setup-form"\s+hidden/.test(distDirectoryHtml)],
  ['first-run setup is opt-in for the current environment', /FIRST_RUN_SETUP_ENABLED === 'true'/.test(server) && /if \(!firstRunSetupEnabled\) return json\(res, 200, \{ required: false \}\)/.test(server)],
  ['login HTML cannot stay cached with stale first-run markup', /if \(requestPath === '\/login\.html'\) headers\['Cache-Control'\] = 'no-store'/.test(server)],
  ['setup creation is disabled unless explicitly enabled', /if \(!firstRunSetupEnabled\) return json\(res, 404, \{ error: 'setup_disabled' \}\)/.test(server)],
  ['setup creation rechecks bootstrap state under a database lock', /pg_advisory_xact_lock\(hashtext\('territory_crm_first_run_setup'\)\)[\s\S]*SELECT COUNT\(\*\)::int AS count FROM users WHERE is_active=true AND deleted_at IS NULL[\s\S]*setup_already_completed/.test(server)],
];
const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) { console.error(`LOCAL LOGIN CONTRACT: FAIL (${missing.join(', ')})`); process.exit(1); }
console.log(`LOCAL LOGIN CONTRACT: PASS (${required.length} checks)`);
