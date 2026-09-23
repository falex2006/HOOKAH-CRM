import fs from 'node:fs';
const html = fs.readFileSync('login.html', 'utf8');
const js = fs.readFileSync('login.js', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const profile = fs.readFileSync('staff-profile.js', 'utf8');
const lock = fs.readFileSync('lock.js', 'utf8');
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
];
const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) { console.error(`LOCAL LOGIN CONTRACT: FAIL (${missing.join(', ')})`); process.exit(1); }
console.log(`LOCAL LOGIN CONTRACT: PASS (${required.length} checks)`);
