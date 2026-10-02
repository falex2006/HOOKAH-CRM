import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync('style.css','utf8');
assert.match(css,/Shared sidebar logo slot/);
assert.match(css,/\.portal-sidebar \.brand>\.hookah-pos-brand,\.platform-sidebar \.brand>\.hookah-pos-brand\{[^}]*flex:0 1 auto;[^}]*width:min\(190px,100%\);max-width:100%;min-width:0;height:auto;max-height:61px;aspect-ratio:200\/64/);
assert.match(css,/\.portal-sidebar \.hookah-pos-brand img,\.platform-sidebar \.hookah-pos-brand img\{[^}]*object-fit:contain;object-position:left center/);
assert.match(css,/@media\(max-width:900px\)\{\.portal-sidebar \.brand>\.hookah-pos-brand,\.platform-sidebar \.brand>\.hookah-pos-brand\{width:min\(42px,100%\);height:40px/);
assert.doesNotMatch(css,/hookah-pos-brand\{[^}]*width:190px/,'logo must never have an unshrinkable 190px width');
assert.equal((css.match(/Shared sidebar logo slot/g)||[]).length,1,'one shared logo contract');
assert.doesNotMatch(css,/Hookah POS product lockup in the employee workspace sidebar/,'duplicate staff-only logo rules removed');
for(const file of ['index.html','admin.html','platform.html']){
 const html=fs.readFileSync(file,'utf8');assert.match(html,/<picture class="hookah-pos-brand"><source media="\(max-width:900px\)" srcset="\/assets\/brand\/hookah-pos-symbol.svg/);
 assert.match(html,/hookah-pos-lockup-animated\.svg[^>]*width="190" height="61"/,'animated desktop lockup and intrinsic dimensions are present');
 assert.match(html,/prefers-reduced-motion:reduce[^>]+hookah-pos-lockup\.svg/,'reduced-motion static fallback is present');
 assert.equal(html,fs.readFileSync(`dist/${file}`,'utf8'));
}
assert.equal(css,fs.readFileSync('dist/style.css','utf8'));
console.log('SIDEBAR BRAND CONTRACT: PASS (shared fluid slot, contained aspect ratio, compact symbol and source/dist parity)');
