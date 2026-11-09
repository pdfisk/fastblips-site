// HtmlPanel: a Panel that shows a piece of formatted HTML - a forum post, a
// preview - and scrolls when it is longer than the panel (see docs/widgets.txt).
//
// The HTML is sanitized first (html-sanitize.js): only safe tags and
// attributes are kept, and links open in a new tab. Spoilers (Thredded's
// <spoiler>) open and close when clicked. The look of the content (headings,
// code, quotes, tables) is CONTENT_STYLE, which CardListPanel shares.

import { Panel } from './panel.js';
import { sanitizeFragment } from '../html-sanitize.js';

/** How formatted content looks inside any element with the class cr-html. */
export const CONTENT_STYLE = `
.cr-html{color:var(--cr-text);font:var(--cr-font-size)/1.5 var(--cr-font-ui);overflow-wrap:anywhere}
.cr-html>:first-child{margin-top:0}.cr-html>:last-child{margin-bottom:0}
.cr-html p,.cr-html ul,.cr-html ol,.cr-html pre,.cr-html blockquote,.cr-html table,.cr-html figure{margin:0 0 .7em}
.cr-html h1,.cr-html h2,.cr-html h3,.cr-html h4{margin:.8em 0 .4em;line-height:1.25}
.cr-html h1{font-size:1.4em}.cr-html h2{font-size:1.25em}.cr-html h3{font-size:1.1em}.cr-html h4{font-size:1em}
.cr-html ul,.cr-html ol{padding-left:1.6em}
.cr-html a{color:var(--cr-accent)}
.cr-html code{font:.95em var(--cr-font-code);background:var(--cr-output-bg);padding:1px 4px;border-radius:3px}
.cr-html pre{font:.95em/1.4 var(--cr-font-code);background:var(--cr-output-bg);padding:8px 10px;border:1px solid var(--cr-divider);
  border-radius:var(--cr-radius-button);overflow:auto;white-space:pre}
.cr-html pre code{background:none;padding:0}
.cr-html blockquote{border-left:3px solid var(--cr-divider);padding:2px 0 2px 10px;color:var(--cr-text-muted)}
.cr-html img{max-width:100%;height:auto}
.cr-html table{border-collapse:collapse}
.cr-html th,.cr-html td{border:1px solid var(--cr-divider);padding:3px 8px}
.cr-html th{background:var(--cr-header-bg)}
.cr-html hr{border:0;border-top:1px solid var(--cr-divider)}
.cr-html .thredded--post--content--spoiler{border:1px dashed var(--cr-divider);border-radius:4px;padding:4px 8px;
  margin:0 0 .7em;cursor:pointer}
.cr-html .thredded--post--content--spoiler--summary{color:var(--cr-text-muted);font-style:italic}
.cr-html .thredded--post--content--spoiler[aria-expanded="false"] .thredded--post--content--spoiler--contents{display:none}
.cr-html .thredded--post--content--spoiler[aria-expanded="true"] .thredded--post--content--spoiler--summary{display:none}
.cr-html-empty{color:var(--cr-text-faint)}
.cr-html-panel{background:var(--cr-input-bg)}
.cr-html-scroll{position:absolute;inset:0;overflow:auto;padding:8px 12px;box-sizing:border-box}
`;

export function installContentStyle() {
  if (document.getElementById('cr-html-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-html-style';
  style.textContent = CONTENT_STYLE;
  document.head.appendChild(style);
}

/** Opens or closes a spoiler when it, or something in it, is clicked. */
export function toggleSpoiler(event) {
  if (event.target.closest('a')) return;
  const spoiler = event.target.closest('.thredded--post--content--spoiler');
  if (!spoiler) return;
  const open = spoiler.getAttribute('aria-expanded') !== 'true';
  spoiler.setAttribute('aria-expanded', String(open));
}

/** Fills element with the sanitized html (or emptyText when there is none). */
export function renderHtml(element, html, emptyText = '') {
  element.classList.add('cr-html');
  if (html && String(html).trim()) {
    element.replaceChildren(sanitizeFragment(html));
  } else {
    const empty = document.createElement('div');
    empty.className = 'cr-html-empty';
    empty.textContent = emptyText;
    element.replaceChildren(empty);
  }
}

export class HtmlPanel extends Panel {
  /** @param {{html?: string, emptyText?: string}} [options] */
  constructor({ html = '', emptyText = '' } = {}) {
    super();
    installContentStyle();
    this.element.classList.add('cr-html-panel');
    this.scroller = document.createElement('div');
    this.scroller.className = 'cr-html-scroll';
    this.body = document.createElement('div');
    this.scroller.appendChild(this.body);
    this.element.appendChild(this.scroller);
    this.body.addEventListener('click', toggleSpoiler);
    this._html = '';
    this.emptyText = emptyText;
    this.html = html;
  }

  /** The HTML shown (as given; what is shown is its sanitized form). */
  get html() { return this._html; }
  set html(value) {
    this._html = String(value ?? '');
    renderHtml(this.body, this._html, this._emptyText);
    this.scroller.scrollTop = 0;
  }

  /** Shown, faint, when there is no HTML. */
  get emptyText() { return this._emptyText; }
  set emptyText(text) {
    this._emptyText = String(text ?? '');
    if (!this._html.trim()) renderHtml(this.body, '', this._emptyText);
  }

  /** Shows plain text (e.g. "Loading..."), not HTML. */
  showText(text) {
    this._html = '';
    renderHtml(this.body, '', text);
  }

  /** An HtmlPanel holds only its content. */
  add() {
    throw new Error('HtmlPanel cannot contain other widgets');
  }
}
