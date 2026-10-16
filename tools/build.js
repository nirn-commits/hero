// index.html と CSS/JS を1つのHTMLにまとめる: node tools/build.js
// 出力 dist/hero.html は claude.ai の Artifact 用（doctype/head/body は付けない）
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const part = (name) => {
  const m = src.match(new RegExp(`<!--BUILD:${name}-->([\\s\\S]*?)<!--/BUILD:${name}-->`));
  if (!m) throw new Error('missing block ' + name);
  return m[1].trim();
};
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const head = part('HEAD').replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}</style>`);
const scripts = [...part('SCRIPTS').matchAll(/<script src="([^"]+)"><\/script>/g)]
  .map((m) => `<script>\n${fs.readFileSync(path.join(root, m[1]), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`)
  .join('\n');
const out = `${head}\n${part('BODY')}\n${scripts}\n`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'hero.html'), out);
console.log('dist/hero.html', (out.length / 1024).toFixed(1) + 'KB');
