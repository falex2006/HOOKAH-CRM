import assert from 'node:assert/strict';
import fs from 'node:fs';

const portal = fs.readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('../VISUAL_PAGE_RULES.md', import.meta.url), 'utf8');
const extractFunction = (name) => {
  const start = portal.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const open = portal.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < portal.length; index += 1) {
    if (portal[index] === '{') depth += 1;
    if (portal[index] === '}' && --depth === 0) return portal.slice(start, index + 1);
  }
  return null;
};
const greetingSource = extractFunction('getDashboardGreetingForHour');
const hourSource = extractFunction('getVenueLocalHour');
assert.ok(greetingSource, 'dashboard greeting period mapper must exist');
assert.ok(hourSource, 'venue timezone hour reader must exist');
const greetingForHour = new Function(`${greetingSource}; return getDashboardGreetingForHour;`)();
const venueLocalHour = new Function(`${hourSource}; return getVenueLocalHour;`)();

for (const [hour, expected] of [
  [0, 'Доброй ночи'], [4, 'Доброй ночи'], [5, 'Доброе утро'], [11, 'Доброе утро'],
  [12, 'Добрый день'], [17, 'Добрый день'], [18, 'Добрый вечер'], [21, 'Добрый вечер'],
  [22, 'Доброй ночи'], [23, 'Доброй ночи'],
]) assert.equal(greetingForHour(hour), expected, `incorrect greeting for ${hour}:00`);
assert.equal(greetingForHour(24), 'Здравствуйте', 'invalid hour must use a neutral greeting');

const instant = new Date('2026-09-25T00:30:00.000Z');
assert.equal(venueLocalHour(instant, 'Asia/Yekaterinburg'), 5, 'venue timezone should drive local hour');
assert.equal(greetingForHour(venueLocalHour(instant, 'Europe/Moscow')), 'Доброй ночи', 'same instant should use the selected venue timezone');
assert.equal(venueLocalHour(instant, 'Not/A_Timezone'), null, 'invalid timezone should fall back to a neutral greeting');

assert.match(portal, /id="dashboard-greeting"/);
assert.match(portal, /venueTimezone = String\(venue\.timezone \|\| ''\)/);
assert.match(portal, /setInterval\(updateDashboardGreeting, 60_000\)/);
assert.doesNotMatch(portal, /Добрый вечер, \$\{esc\(/, 'fixed evening greeting must not return');
assert.match(rules, /приветствие показывается только в основном заголовке/);
console.log('DASHBOARD GREETING CONTRACT: PASS (four time periods, venue timezone, invalid timezone and display location)');
