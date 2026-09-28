const fs = require('fs');

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');

const NAME_BY_KEY = {
  '53:64': 'lock', '65:16': 'key', '74:18': 'eye', '92:16': 'shield',
  '98:16': 'refreshCw', '127:18': 'settings', '139:18': 'help', '146:16': 'logout',
  '171:28': 'trendingUp', '188:34': 'search', '205:34': 'plus', '222:34': 'download',
  '272:16': 'list', '300:15': 'trash', '316:15': 'globe', '324:15': 'user',
  '338:15': 'fileText', '392:16': 'edit', '398:16': 'upload', '456:18': 'sparkles',
  '486:16': 'save', '547:16': 'folder', '662:24': 'tool', '758:16': 'x',
  '880:18': 'keyboard', '916:16': 'refreshCcw', '1006:18': 'cloud', '1063:18': 'wifi',
  '1079:18': 'book'
};

const EXTRA = {
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>',
  check: '<path d="M20 6L9 17l-5-5"></path>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'
};

const svgs = [...html.matchAll(/<svg([^>]*)>([\s\S]*?)<\/svg>/g)];
const symbols = new Map();
let replaced = 0;

for (const m of svgs) {
  const attrs = m[1];
  const inner = m[2].trim().replace(/>\s+</g, '><');
  const w = (attrs.match(/width="(\d+)"/) || [])[1] || '18';
  const lineNo = html.slice(0, m.index).split('\n').length;
  const name = NAME_BY_KEY[lineNo + ':' + w];
  if (!name) {
    console.error('UNMAPPED svg at line ' + lineNo + ' size ' + w + ': ' + inner.slice(0, 80));
    process.exit(1);
  }
  if (!symbols.has(name)) symbols.set(name, inner);
  replaced++;
}

for (const [name, inner] of Object.entries(EXTRA)) symbols.set(name, inner);

const symbolHtml = [...symbols.entries()]
  .map(([name, inner]) => `        <symbol id="icon-${name}" viewBox="0 0 24 24">${inner}</symbol>`)
  .join('\n');
const sprite = `    <svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true" focusable="false">\n${symbolHtml}\n    </svg>`;

let out = html.replace(/<link rel="stylesheet" href="all\.min\.css">\s*/, '');
out = out.replace(/<body[^>]*>/, m => m + '\n' + sprite);

for (const m of svgs) {
  const attrs = m[1];
  const inner = m[2].trim().replace(/>\s+</g, '><');
  const w = (attrs.match(/width="(\d+)"/) || [])[1] || '18';
  const h = (attrs.match(/height="(\d+)"/) || [])[1] || w;
  const lineNo = html.slice(0, m.index).split('\n').length;
  const name = NAME_BY_KEY[lineNo + ':' + w];
  const use = `<svg class="icon" width="${w}" height="${h}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  out = out.replace(m[0], use);
}

fs.writeFileSync(file, out);
console.log('Replaced ' + replaced + ' svgs, symbols: ' + symbols.size + ' (' + [...symbols.keys()].join(', ') + ')');
