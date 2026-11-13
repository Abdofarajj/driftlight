// Turn dist/ into one self-contained page for a quick preview link (claude.ai Artifact).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const out = process.argv[2] || 'dist/preview.html';
let html = readFileSync('dist/index.html', 'utf8');
const js = readdirSync('dist/assets').filter((f) => f.endsWith('.js')).map((f) => readFileSync(`dist/assets/${f}`, 'utf8')).join('\n');
html = html
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?html[^>]*>/g, '').replace(/<\/?head>/g, '').replace(/<\/?body>/g, '')
  .replace(/<meta charset[^>]*>/, '').replace(/<meta name="viewport"[^>]*>/, '')
  .replace(/<script type="module" crossorigin src="[^"]*"><\/script>/, '');
html = html.replace(/<title>[^<]*<\/title>/, '<title>DriftLight</title>');
// title must come first; put the bundle at the end so the DOM exists when it runs
html = '<title>DriftLight</title>\n' + html.replace('<title>DriftLight</title>', '') + `\n<script type="module">\n${js.replace(/<\/script/g, '<\\/script')}\n</script>\n`;
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');
