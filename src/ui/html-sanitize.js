// sanitizeHtml: keeps the safe part of a piece of HTML from the server (a
// forum post, formatted by Thredded), for an HtmlPanel or a CardListPanel.
//
// The server already sanitizes posts; this is a second check in the page, so
// a mistake there cannot run script in the IDE. Only an allowlist of tags and
// attributes survives. Links must be http(s) or mailto and open in a new tab;
// images must be https or data:image; a relative link (an @-mention) becomes
// plain text. Embedded frames (video previews) become a link to what they
// showed. Needs a DOM (a <template> parses the HTML without running it).

const TAGS = new Set(('a abbr b blockquote br caption code dd del details div dl dt em figcaption figure '
  + 'h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre q s samp small span strike strong sub summary sup '
  + 'table tbody td tfoot th thead tr tt u ul var').split(' '));

// Elements dropped with everything inside them.
const DROP = new Set('script style noscript template object embed form input textarea select button svg math'.split(' '));

const ATTRS = {
  '*': ['title', 'class', 'role', 'aria-expanded', 'aria-hidden', 'aria-label', 'lang', 'dir'],
  a: ['href'],
  img: ['src', 'alt', 'width', 'height'],
  td: ['colspan', 'rowspan', 'align'],
  th: ['colspan', 'rowspan', 'align', 'scope'],
  ol: ['start', 'reversed'],
  div: ['tabindex'],
};

const SAFE_LINK = /^(https?:|mailto:)/i;
const SAFE_IMAGE = /^(https:|data:image\/(png|gif|jpe?g|webp|svg\+xml);)/i;

function allowed(tag, name) {
  return ATTRS['*'].includes(name) || (ATTRS[tag] ?? []).includes(name);
}

function clean(node, doc) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue;                        // text
    if (child.nodeType !== 1) { child.remove(); continue; }    // comments etc.
    const tag = child.tagName.toLowerCase();
    if (tag === 'iframe') {
      const src = child.getAttribute('src') ?? '';
      if (SAFE_LINK.test(src)) {
        const a = doc.createElement('a');
        a.textContent = src;
        a.setAttribute('href', src);
        child.replaceWith(a);
        cleanLink(a);
      } else child.remove();
      continue;
    }
    if (DROP.has(tag)) { child.remove(); continue; }
    if (!TAGS.has(tag)) {                                      // keep what is inside it
      clean(child, doc);
      child.replaceWith(...child.childNodes);
      continue;
    }
    for (const attr of [...child.attributes]) {
      if (!allowed(tag, attr.name.toLowerCase())) child.removeAttribute(attr.name);
    }
    if (tag === 'a') {
      if (!cleanLink(child)) {
        clean(child, doc);
        child.replaceWith(...child.childNodes);
        continue;
      }
    }
    if (tag === 'img') {
      const src = (child.getAttribute('src') ?? '').trim();
      if (!SAFE_IMAGE.test(src)) { child.remove(); continue; }
      child.setAttribute('loading', 'lazy');
      child.setAttribute('referrerpolicy', 'no-referrer');
    }
    clean(child, doc);
  }
}

// A link that may stay opens in a new tab; false if it must go.
function cleanLink(a) {
  const href = (a.getAttribute('href') ?? '').trim();
  if (!SAFE_LINK.test(href)) return false;
  a.setAttribute('target', '_blank');
  a.setAttribute('rel', 'noopener noreferrer nofollow');
  return true;
}

/** The safe part of html, as a DocumentFragment ready to insert. */
export function sanitizeFragment(html, doc = globalThis.document) {
  const template = doc.createElement('template');
  template.innerHTML = String(html ?? '');
  const fragment = template.content;
  clean(fragment, doc);
  return fragment;
}

/** The safe part of html, as HTML text. */
export function sanitizeHtml(html, doc = globalThis.document) {
  const box = doc.createElement('div');
  box.append(sanitizeFragment(html, doc));
  return box.innerHTML;
}
