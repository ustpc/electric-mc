// HTML mutations that imitate the kinds of change ScholarOne might ship:
// renamed classes, extra wrappers, restyled labels, reordered columns,
// different whitespace, and layout tables turned into modern markup. The
// parsers should give the same answer after each one.

export type Mutation = (doc: Document) => void;

const walkText = (doc: Document, fn: (t: Text) => void) => {
  const w = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
  const nodes: Text[] = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
  nodes.forEach(fn);
};

export const MUTATIONS: Record<string, Mutation> = {
  'strip classes and ids': (doc) => {
    doc.querySelectorAll('*').forEach((el) => {
      for (const a of ['class', 'id', 'style', 'width', 'cellpadding', 'cellspacing', 'border', 'valign']) el.removeAttribute(a);
    });
  },
  'rename classes': (doc) => {
    doc.querySelectorAll('[class]').forEach((el) => el.setAttribute('class', `s1-${Math.random().toString(36).slice(2, 8)}`));
  },
  'wrap in divs': (doc) => {
    doc.querySelectorAll('table').forEach((t) => {
      const outer = doc.createElement('div');
      const inner = doc.createElement('div');
      outer.className = 'mui-container';
      t.replaceWith(outer);
      outer.appendChild(inner);
      inner.appendChild(t);
    });
  },
  'uppercase labels': (doc) => {
    doc.querySelectorAll('th, b, h1, h2, h3').forEach((el) => {
      el.childNodes.forEach((n) => {
        if (n.nodeType === 3) n.textContent = (n.textContent ?? '').toUpperCase();
      });
      el.querySelectorAll('*').forEach((c) => c.childNodes.forEach((n) => {
        if (n.nodeType === 3) n.textContent = (n.textContent ?? '').toUpperCase();
      }));
    });
  },
  'nbsp and extra whitespace': (doc) => {
    walkText(doc, (t) => {
      t.textContent = '\n   ' + (t.textContent ?? '').replace(/ /g, ' ') + '  \t';
    });
  },
  'reverse column order': (doc) => {
    doc.querySelectorAll('tr').forEach((tr) => {
      const cells = Array.from(tr.children);
      if (cells.length < 3) return;
      cells.reverse().forEach((c) => tr.appendChild(c));
    });
  },
  'th become td with bold': (doc) => {
    doc.querySelectorAll('th').forEach((th) => {
      const td = doc.createElement('td');
      const b = doc.createElement('b');
      b.innerHTML = th.innerHTML;
      td.appendChild(b);
      th.replaceWith(td);
    });
  },
  'bold labels become spans': (doc) => {
    doc.querySelectorAll('b, strong').forEach((b) => {
      const s = doc.createElement('span');
      s.innerHTML = b.innerHTML;
      b.replaceWith(s);
    });
  },
  'label rows become dl': (doc) => {
    // Two-cell "Label: | value" rows rewritten as <dl><dt><dd>, as a modern template might.
    doc.querySelectorAll('table').forEach((t) => {
      const trs = Array.from(t.querySelectorAll(':scope > tbody > tr, :scope > tr'));
      if (!trs.length || !trs.every((tr) => tr.children.length === 2 || tr.children.length === 1)) return;
      if (!trs.some((tr) => /:\s*$/.test(tr.children[0]?.textContent ?? ''))) return;
      const dl = doc.createElement('dl');
      for (const tr of trs) {
        if (tr.children.length === 1) {
          const h = doc.createElement('h4');
          h.innerHTML = tr.children[0]!.innerHTML;
          dl.appendChild(h);
          continue;
        }
        const dt = doc.createElement('dt');
        const dd = doc.createElement('dd');
        dt.innerHTML = tr.children[0]!.innerHTML;
        dd.innerHTML = tr.children[1]!.innerHTML;
        dl.append(dt, dd);
      }
      t.replaceWith(dl);
    });
  },
  'add banner and sidebar noise': (doc) => {
    const banner = doc.createElement('div');
    banner.innerHTML = '<p>We use cookies to improve your experience. <a href="#">Accept</a></p><p>Scheduled maintenance on 01-Nov-2026 from 02:00 to 04:00 EST.</p>';
    doc.body.prepend(banner);
    const aside = doc.createElement('aside');
    aside.innerHTML = '<ul><li><a href="#">Instructions &amp; Forms</a></li><li><a href="#">Resources</a></li><li><a href="#">Get Help Now</a></li></ul>';
    doc.body.append(aside);
  },
  'curly quotes and colons dropped': (doc) => {
    walkText(doc, (t) => {
      t.textContent = (t.textContent ?? '').replace(/'/g, '’').replace(/^(\s*[A-Z][A-Za-z ()]+):(\s*)$/, '$1$2');
    });
  },
};
