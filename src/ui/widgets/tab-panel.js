// TabPanel: a Panel showing one of several pages at a time, chosen by a row
// of tab labels along its top or bottom edge (see docs/widgets.txt).

import { Panel } from './panel.js';

export const TAB_STRIP_HEIGHT = 24;

const STYLE = `
.cr-tab-panel>[hidden]{display:none!important}
.cr-tab-strip{position:absolute;left:0;right:0;display:flex;gap:2px;padding:0 4px;box-sizing:border-box;
  background:var(--cr-buttonbar-bg);font:var(--cr-font-size-small) var(--cr-font-ui);overflow:hidden}
.cr-tab-strip.cr-tabs-bottom{bottom:0;border-top:1px solid var(--cr-buttonbar-border);align-items:flex-start}
.cr-tab-strip.cr-tabs-top{top:0;border-bottom:1px solid var(--cr-buttonbar-border);align-items:flex-end}
.cr-tab{box-sizing:border-box;height:${TAB_STRIP_HEIGHT - 3}px;padding:0 12px;border:1px solid transparent;
  background:transparent;color:var(--cr-text-muted);font:inherit;cursor:pointer;white-space:nowrap}
.cr-tab:hover{background:var(--cr-button-hover);color:var(--cr-tab-hover-text)}
.cr-tab.cr-tab-selected{background:var(--cr-input-bg);color:var(--cr-text);border-color:var(--cr-buttonbar-border)}
.cr-tabs-bottom .cr-tab{border-radius:0 0 var(--cr-radius-button) var(--cr-radius-button);margin-top:-1px}
.cr-tabs-bottom .cr-tab.cr-tab-selected{border-top-color:var(--cr-input-bg)}
.cr-tabs-top .cr-tab{border-radius:var(--cr-radius-button) var(--cr-radius-button) 0 0;margin-bottom:-1px}
.cr-tabs-top .cr-tab.cr-tab-selected{border-bottom-color:var(--cr-input-bg)}
`;

function installStyle() {
  if (document.getElementById('cr-tab-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-tab-panel-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export class TabPanel extends Panel {
  /** @param {{tabPosition?: 'top'|'bottom'}} options */
  constructor({ tabPosition = 'top' } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-tab-panel');
    this.tabPosition = tabPosition === 'bottom' ? 'bottom' : 'top';
    this._tabs = [];            // {label, widget, button}, in order
    this._selected = -1;
    this.strip = document.createElement('div');
    this.strip.className = `cr-tab-strip cr-tabs-${this.tabPosition}`;
    this.strip.style.height = `${TAB_STRIP_HEIGHT}px`;
    this.strip.setAttribute('role', 'tablist');
    this.element.appendChild(this.strip);
  }

  /** Adds a page under a tab with this label and returns the widget.
   *  The first page added is selected. */
  addTab(label, widget) {
    super.add(widget);
    const button = document.createElement('button');
    button.className = 'cr-tab';
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('role', 'tab');
    const tab = { label, widget, button };
    button.addEventListener('click', () => this.select(this._tabs.indexOf(tab)));
    this._tabs.push(tab);
    this.strip.appendChild(button);
    if (this._selected < 0) this.select(0);
    else widget.visible = false;
    return widget;
  }

  /** Adding a plain child is not supported: every page needs a label. */
  add() {
    throw new Error('Use TabPanel.addTab(label, widget)');
  }

  remove(child) {
    const index = this._tabs.findIndex((t) => t.widget === child);
    if (index >= 0) {
      this._tabs[index].button.remove();
      this._tabs.splice(index, 1);
      if (this._selected >= this._tabs.length || this._selected === index) {
        this._selected = -1;
        if (this._tabs.length) this.select(Math.min(index, this._tabs.length - 1));
      } else if (index < this._selected) {
        this._selected -= 1;
      }
    }
    super.remove(child);
  }

  /** The tab labels, in order. */
  get labels() { return this._tabs.map((t) => t.label); }

  /** Index of the page showing (-1 if there are none). */
  get selectedIndex() { return this._selected; }

  /** The widget of the page showing, or null. */
  get selectedWidget() { return this._tabs[this._selected]?.widget ?? null; }

  /** The label of the page showing, or null. */
  get selectedLabel() { return this._tabs[this._selected]?.label ?? null; }

  /** Shows the page at this index (or with this label); fires select. */
  select(which) {
    const index = typeof which === 'string' ? this._tabs.findIndex((t) => t.label === which) : which;
    if (index < 0 || index >= this._tabs.length || index === this._selected) return;
    this._selected = index;
    this._tabs.forEach((t, i) => {
      const on = i === index;
      t.widget.visible = on;
      t.button.classList.toggle('cr-tab-selected', on);
      t.button.setAttribute('aria-selected', String(on));
    });
    this.layout();
    this.element.dispatchEvent(new CustomEvent('select', {
      detail: { index, label: this.selectedLabel, widget: this.selectedWidget },
    }));
  }

  layout() {
    const { width, height } = this.bounds;
    const pageHeight = Math.max(0, height - TAB_STRIP_HEIGHT);
    const top = this.tabPosition === 'top' ? TAB_STRIP_HEIGHT : 0;
    for (const t of this._tabs) t.widget.setBounds(0, top, width, pageHeight);
    super.layout();
  }
}
