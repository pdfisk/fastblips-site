// Menu: a pulldown menu - a labelled button that opens a list of items
// (see docs/widgets.txt).
//
//   const menu = new Menu('Views');
//   menu.addItem('Transcript', () => ..., { checked: () => true });

import { Widget } from './widget.js';

const STYLE = `
.cr-menu{display:flex;align-items:stretch}
.cr-menu-button{border:0;background:transparent;color:inherit;font:inherit;
  padding:0 12px;cursor:pointer;white-space:nowrap}
.cr-menu-button:hover,.cr-menu.open .cr-menu-button{background:var(--cr-nav-hover)}
.cr-menu-list{position:fixed;min-width:160px;margin:0;padding:4px 0;list-style:none;
  background:var(--cr-menu-bg);color:var(--cr-menu-text);border:1px solid var(--cr-menu-border);
  box-shadow:var(--cr-menu-shadow);font:var(--cr-font-size-nav) var(--cr-font-ui);z-index:100001}
.cr-menu-item{display:flex;align-items:center;gap:6px;padding:5px 14px 5px 8px;
  cursor:pointer;white-space:nowrap}
.cr-menu-item:hover,.cr-menu-item:focus{background:var(--cr-accent);color:var(--cr-accent-text);outline:0}
.cr-menu-check{width:14px;text-align:center}
.cr-menu-empty,.cr-menu-disabled{color:var(--cr-text-faint);cursor:default;pointer-events:none}
.cr-menu-separator{height:1px;margin:4px 0;background:var(--cr-menu-separator);pointer-events:none}
`;

function installStyle() {
  if (document.getElementById('cr-menu-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-menu-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

let openMenu = null;

export class Menu extends Widget {
  constructor(label) {
    super();
    installStyle();
    this.element.classList.add('cr-menu');
    this.items = [];

    this.button = document.createElement('button');
    this.button.className = 'cr-menu-button';
    this.button.setAttribute('aria-haspopup', 'menu');
    this.button.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    this.element.appendChild(this.button);

    this.list = document.createElement('ul');
    this.list.className = 'cr-menu-list';
    this.list.setAttribute('role', 'menu');
    this.list.hidden = true;
    this.element.appendChild(this.list);

    this._onOutside = (e) => { if (!this.element.contains(e.target)) this.close(); };
    this._onKey = (e) => { if (e.key === 'Escape') { this.close(); this.button.focus(); } };
    this.label = label;
  }

  get label() { return this.button.textContent; }
  set label(text) { this.button.textContent = text; }

  get isOpen() { return !this.list.hidden; }

  preferredWidth() { return Math.ceil(this.button.scrollWidth); }

  /**
   * Adds an item.
   * @param {string} label
   * @param {() => void} action - run when the item is chosen
   * @param {{checked?: () => boolean, enabled?: () => boolean}} options -
   *   checked: a check mark shows whenever it returns true;
   *   enabled: the item is greyed out whenever it returns false
   */
  addItem(label, action, { checked, enabled } = {}) {
    const item = { label, action, checked, enabled };
    this.items.push(item);
    return item;
  }

  /** Adds a dividing line between groups of items. */
  addSeparator() {
    const item = { separator: true };
    this.items.push(item);
    return item;
  }

  /**
   * Optional function returning the items to show, called each time the menu
   * opens (for menus whose contents change). Its items take the same shape
   * as addItem's arguments: {label, action, checked}. When set, it replaces
   * the items added with addItem.
   */
  set itemsProvider(fn) { this._itemsProvider = fn; }
  get itemsProvider() { return this._itemsProvider ?? null; }

  open() {
    if (openMenu && openMenu !== this) openMenu.close();
    openMenu = this;
    const items = this._itemsProvider ? this._itemsProvider() : this.items;
    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'cr-menu-item cr-menu-empty';
      empty.textContent = '(none)';
      this.list.replaceChildren(empty);
    } else {
      this.list.replaceChildren(...items.map((item) => this._renderItem(item)));
    }
    this.list.hidden = false;
    // Place below the button, keeping the list inside the window.
    const r = this.button.getBoundingClientRect();
    const w = this.list.offsetWidth;
    this.list.style.left = `${Math.max(0, Math.min(r.left, window.innerWidth - w))}px`;
    this.list.style.top = `${r.bottom}px`;
    this.element.classList.add('open');
    this.button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', this._onOutside, true);
    document.addEventListener('keydown', this._onKey);
  }

  close() {
    if (!this.isOpen) return;
    this.list.hidden = true;
    this.element.classList.remove('open');
    this.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this._onOutside, true);
    document.removeEventListener('keydown', this._onKey);
    if (openMenu === this) openMenu = null;
  }

  _renderItem(item) {
    const li = document.createElement('li');
    if (item.separator) {
      li.className = 'cr-menu-separator';
      li.setAttribute('role', 'separator');
      return li;
    }
    li.className = 'cr-menu-item';
    li.tabIndex = -1;
    const check = document.createElement('span');
    check.className = 'cr-menu-check';
    if (item.checked) {
      const on = Boolean(item.checked());
      li.setAttribute('role', 'menuitemcheckbox');
      li.setAttribute('aria-checked', String(on));
      check.textContent = on ? '✓' : '';
    } else {
      li.setAttribute('role', 'menuitem');
    }
    const text = document.createElement('span');
    text.textContent = item.label;
    li.append(check, text);
    if (item.enabled && !item.enabled()) {
      li.classList.add('cr-menu-disabled');
      li.setAttribute('aria-disabled', 'true');
      return li;
    }
    li.addEventListener('click', () => { this.close(); item.action(); });
    return li;
  }

  dispose() {
    this.close();
    super.dispose();
  }
}
