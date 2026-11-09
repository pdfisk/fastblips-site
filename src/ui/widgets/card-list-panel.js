// CardListPanel: a Panel showing a column of cards that scrolls - the posts
// of a forum topic, or the posts waiting for a moderator (see docs/widgets.txt).
//
// Above the cards there may be a heading and a line under it (a topic's title
// and summary). Each card has an author with a round avatar, a short line
// beside it (when), small badges, a body of HTML (sanitized: see HtmlPanel)
// or plain text, and a row of action links. Clicking an action fires an
// action event (a CustomEvent) with detail { action, item, index }.
//
//   const list = new CardListPanel({ emptyText: 'No posts' });
//   list.heading = 'How do I draw a circle?';
//   list.items = [{ value: 7, author: 'ann', meta: '5 min ago', html: '<p>Hi</p>',
//                   badges: [{ label: 'edited' }], actions: [{ name: 'quote', label: 'Quote' }] }];
//   list.element.addEventListener('action', (e) => console.log(e.detail.action, e.detail.item.value));
//
// Items: { value, author, avatar?, meta?, metaTitle?, badges?: [{label, tone?}],
// html? | text?, actions?: [{name, label, tone?}], context?, highlight? }.
// context is a line above the body (e.g. which topic a post is in); tone is
// 'danger' or 'warning'. Actions and links in a card are buttons and links,
// so they work from the keyboard.

import { Panel } from './panel.js';
import { installContentStyle, renderHtml, toggleSpoiler } from './html-panel.js';

const STYLE = `
.cr-cards{position:absolute;inset:0;overflow:auto;box-sizing:border-box;padding:8px 10px 12px;
  background:var(--cr-window-bg);font:var(--cr-font-size) var(--cr-font-ui);color:var(--cr-text)}
.cr-cards-heading{font-size:1.25em;font-weight:600;margin:2px 2px 2px;overflow-wrap:anywhere}
.cr-cards-sub{color:var(--cr-text-muted);font-size:var(--cr-font-size-small);margin:0 2px 10px}
.cr-cards-empty{color:var(--cr-text-faint);padding:6px 2px}
.cr-card{background:var(--cr-input-bg);border:1px solid var(--cr-divider);border-radius:var(--cr-window-radius);
  padding:10px 12px;margin-bottom:8px;scroll-margin:8px}
.cr-card.cr-card-highlight{border-color:var(--cr-accent);box-shadow:0 0 0 1px var(--cr-accent)}
.cr-card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;min-width:0}
.cr-card-avatar{flex:none;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:600;font-size:14px;overflow:hidden}
.cr-card-avatar img{width:100%;height:100%}
.cr-card-author{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr-card-meta{color:var(--cr-text-muted);font-size:var(--cr-font-size-small);white-space:nowrap}
.cr-card-badge{font-size:11px;line-height:16px;padding:0 6px;border-radius:8px;white-space:nowrap;
  background:var(--cr-header-bg);color:var(--cr-text-muted);border:1px solid var(--cr-divider)}
.cr-card-badge.cr-tone-warning{background:#fff3cd;color:#7a5600;border-color:#e8c766}
.cr-card-badge.cr-tone-danger{background:#fde2e1;color:#9b1c1c;border-color:#efa8a5}
.cr-card-context{color:var(--cr-text-muted);font-size:var(--cr-font-size-small);margin:-2px 0 8px}
.cr-card-text{white-space:pre-wrap;overflow-wrap:anywhere}
.cr-card-actions{display:flex;flex-wrap:wrap;gap:2px 4px;margin:8px -6px -4px;padding-top:6px;
  border-top:1px solid var(--cr-divider)}
.cr-card-action{border:0;background:transparent;color:var(--cr-text-muted);font:var(--cr-font-size-small) var(--cr-font-ui);
  padding:2px 6px;border-radius:var(--cr-radius-button);cursor:pointer}
.cr-card-action:hover,.cr-card-action:focus-visible{background:var(--cr-button-hover);color:var(--cr-text)}
.cr-card-action.cr-tone-danger:hover{color:var(--cr-danger)}
.cr-card-action:disabled{opacity:.5;cursor:default}
`;

function installStyle() {
  installContentStyle();
  if (document.getElementById('cr-cards-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-cards-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** A colour for a name, the same each time. */
export function nameHue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

/** A round avatar: the image if it is safe to show, else the name's first letter. */
export function avatarElement(name, src = '') {
  const box = document.createElement('span');
  box.className = 'cr-card-avatar';
  box.setAttribute('aria-hidden', 'true');
  if (/^(https:|data:image\/)/i.test(String(src))) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    img.referrerPolicy = 'no-referrer';
    box.appendChild(img);
  } else {
    box.style.background = `hsl(${nameHue(name)},50%,45%)`;
    box.textContent = (String(name).trim()[0] ?? '?').toUpperCase();
  }
  return box;
}

export class CardListPanel extends Panel {
  /** @param {{items?: object[], emptyText?: string, heading?: string, subheading?: string}} [options] */
  constructor({ items = [], emptyText = '', heading = '', subheading = '' } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-card-list-panel');
    this.scroller = document.createElement('div');
    this.scroller.className = 'cr-cards';
    this.headingElement = document.createElement('div');
    this.headingElement.className = 'cr-cards-heading';
    this.subElement = document.createElement('div');
    this.subElement.className = 'cr-cards-sub';
    this.list = document.createElement('div');
    this.list.setAttribute('role', 'feed');
    this.note = document.createElement('div');
    this.note.className = 'cr-cards-empty';
    this.scroller.append(this.headingElement, this.subElement, this.list, this.note);
    this.element.appendChild(this.scroller);
    this.scroller.addEventListener('click', (e) => this._click(e));
    this._items = [];
    this._emptyText = emptyText;
    this.heading = heading;
    this.subheading = subheading;
    this.items = items;
  }

  /** A title over the cards ('' for none). */
  get heading() { return this.headingElement.textContent; }
  set heading(text) {
    this.headingElement.textContent = String(text ?? '');
    this.headingElement.hidden = !this.headingElement.textContent;
  }

  /** A line under the heading ('' for none). */
  get subheading() { return this.subElement.textContent; }
  set subheading(text) {
    this.subElement.textContent = String(text ?? '');
    this.subElement.hidden = !this.subElement.textContent;
  }

  get items() { return [...this._items]; }
  set items(items) {
    this._items = [...(items ?? [])];
    this._render();
  }

  /** Shown when there are no cards. */
  get emptyText() { return this._emptyText; }
  set emptyText(text) { this._emptyText = String(text ?? ''); this._renderNote(); }

  /** Replaces the card whose value is value (keeping the scroll position). */
  replaceItem(value, item) {
    const index = this._items.findIndex((i) => i.value === value);
    if (index < 0) return;
    this._items[index] = item;
    this.list.children[index]?.replaceWith(this._card(item, index));
  }

  /** Scrolls to the top, the end, or the card whose value is value. */
  scrollToTop() { this.scroller.scrollTop = 0; }
  scrollToEnd() { this.scroller.scrollTop = this.scroller.scrollHeight; }
  scrollToItem(value) {
    const index = this._items.findIndex((i) => i.value === value);
    this.list.children[index]?.scrollIntoView({ block: 'start' });
  }

  /** Greys out (or enables) every action, e.g. while waiting for the server. */
  set busy(value) {
    for (const b of this.list.querySelectorAll('.cr-card-action')) b.disabled = Boolean(value);
  }

  /** A CardListPanel holds only its cards. */
  add() {
    throw new Error('CardListPanel cannot contain other widgets');
  }

  _click(e) {
    toggleSpoiler(e);
    const button = e.target.closest('.cr-card-action');
    if (!button || button.disabled) return;
    const index = Number(button.closest('.cr-card').dataset.index);
    const item = this._items[index];
    if (!item) return;
    this.element.dispatchEvent(new CustomEvent('action', { detail: { action: button.dataset.action, item, index } }));
  }

  _render() {
    this.list.replaceChildren(...this._items.map((item, index) => this._card(item, index)));
    this._renderNote();
  }

  _renderNote() {
    this.note.textContent = this._items.length ? '' : this._emptyText;
    this.note.hidden = this._items.length > 0 || !this._emptyText;
  }

  _card(item, index) {
    const card = document.createElement('article');
    card.className = 'cr-card';
    if (item.highlight) card.classList.add('cr-card-highlight');
    card.dataset.index = String(index);
    const head = document.createElement('div');
    head.className = 'cr-card-head';
    const author = document.createElement('span');
    author.className = 'cr-card-author';
    author.textContent = item.author ?? '';
    head.append(avatarElement(item.author ?? '', item.avatar), author);
    if (item.meta) {
      const meta = document.createElement('span');
      meta.className = 'cr-card-meta';
      meta.textContent = item.meta;
      if (item.metaTitle) meta.title = item.metaTitle;
      head.appendChild(meta);
    }
    for (const badge of item.badges ?? []) {
      const b = document.createElement('span');
      b.className = 'cr-card-badge';
      if (badge.tone) b.classList.add(`cr-tone-${badge.tone}`);
      b.textContent = badge.label;
      head.appendChild(b);
    }
    card.appendChild(head);
    if (item.context) {
      const context = document.createElement('div');
      context.className = 'cr-card-context';
      context.textContent = item.context;
      card.appendChild(context);
    }
    const body = document.createElement('div');
    if (item.html != null) renderHtml(body, item.html, '');
    else { body.className = 'cr-card-text'; body.textContent = item.text ?? ''; }
    card.appendChild(body);
    if (item.actions?.length) {
      const row = document.createElement('div');
      row.className = 'cr-card-actions';
      for (const action of item.actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cr-card-action';
        if (action.tone) button.classList.add(`cr-tone-${action.tone}`);
        button.dataset.action = action.name;
        button.textContent = action.label;
        row.appendChild(button);
      }
      card.appendChild(row);
    }
    return card;
  }
}
