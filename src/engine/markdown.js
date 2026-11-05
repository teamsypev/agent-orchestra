// A small, safe Markdown renderer for the writer's answer: everything is escaped first,
// then a few constructs are turned into HTML. Citations like [3] become links to sources.

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(text, sources) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g, (m, nums) => {
    const links = nums.split(/\s*,\s*/).map((n) => {
      const k = Number(n);
      const src = sources.find((x) => x.n === k);
      return src ? `<a class="cite" href="#src-${k}" title="${esc(src.title)}">${k}</a>` : n;
    });
    return `<sup class="cites">${links.join('')}</sup>`;
  });
  return s;
}

export function renderMarkdown(md, sources = []) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let para = [];
  let list = null; // { tag, items }
  let table = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '), sources)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, sources)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flushTable = () => {
    if (table) {
      const [head, ...rows] = table;
      out.push(
        '<div class="table-wrap"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c, sources)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, sources)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table></div>'
      );
    }
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushTable(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushAll(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = Math.min(4, h[1].length + 1); // # → h2: the page already has an h1
      out.push(`<h${level}>${inline(h[2], sources)}</h${level}>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara(); flushList();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // separator row
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      (table ||= []).push(cells);
      continue;
    }
    flushTable();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      (list ||= { tag, items: [] }).items.push((ul || ol)[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushAll();
  return out.join('\n');
}
