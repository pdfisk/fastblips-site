// MarkdownEditor: a Panel for writing formatted text - a forum post - with a
// row of formatting buttons and Write / Preview tabs (see docs/widgets.txt).
//
// The text is Markdown (as the forum uses: Kramdown, plus <spoiler>). The
// buttons wrap the selection: Bold, Italic, Code, Link, Quote, List, Code
// block and Spoiler. Preview shows the text as it will look, as HTML from
// previewer, an async function (text) => html that the owner supplies (the
// forum's server); without one the Preview tab is hidden.
//
// Events: input (the browser's, on every edit), submit (a CustomEvent, on
// Ctrl+Enter or Cmd+Enter), and mode (a CustomEvent, detail { mode }, when
// Write or Preview is chosen).

import { Panel } from './panel.js';
import { installContentStyle, renderHtml, toggleSpoiler } from './html-panel.js';

const BAR = 28;

const STYLE = `
.cr-md{background:var(--cr-input-bg);border:1px solid var(--cr-divider);border-radius:var(--cr-radius-button);
  box-sizing:border-box;overflow:hidden}
.cr-md:focus-within{border-color:var(--cr-accent)}
.cr-md-bar{position:absolute;left:0;right:0;top:0;height:${BAR}px;display:flex;align-items:center;gap:1px;
  padding:0 4px;box-sizing:border-box;background:var(--cr-buttonbar-bg);border-bottom:1px solid var(--cr-divider);overflow:hidden}
.cr-md-bar button{border:1px solid transparent;background:transparent;color:var(--cr-text-muted);
  font:var(--cr-font-size-small) var(--cr-font-ui);height:22px;min-width:24px;padding:0 6px;
  border-radius:var(--cr-radius-button);cursor:pointer}
.cr-md-bar button:hover{background:var(--cr-button-hover);color:var(--cr-text)}
.cr-md-bar button[aria-pressed="true"]{background:var(--cr-input-bg);border-color:var(--cr-divider);color:var(--cr-text)}
.cr-md-bar .cr-md-gap{flex:1}
.cr-md-text,.cr-md-preview{position:absolute;left:0;right:0;bottom:0;top:${BAR}px;box-sizing:border-box;margin:0}
.cr-md-text{width:100%;border:0;outline:0;resize:none;padding:8px 10px;background:transparent;color:var(--cr-text);
  font:var(--cr-font-size)/1.45 var(--cr-font-code)}
.cr-md-text::placeholder{color:var(--cr-text-faint)}
.cr-md-preview{overflow:auto;padding:8px 12px}
`;

function installStyle() {
  installContentStyle();
  if (document.getElementById('cr-md-style')) return;
  const style = document.createElement('style');
  style.id = 'cr-md-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

// [label, title, how]: how is [before, after, placeholder] around the
// selection, or a function of the selected text for line-based formats.
const prefixLines = (prefix) => (text) => (text || 'text').split('\n').map((l) => prefix + l).join('\n');
const FORMATS = [
  ['B', 'Bold (Ctrl+B)', ['**', '**', 'bold text']],
  ['I', 'Italic (Ctrl+I)', ['_', '_', 'italic text']],
  ['<>', 'Code', ['`', '`', 'code']],
  ['Link', 'Link (Ctrl+K)', ['[', '](https://)', 'link text']],
  ['“', 'Quote', prefixLines('> ')],
  ['•', 'List', prefixLines('- ')],
  ['{ }', 'Python code block', ['\n```python\n', '\n```\n', 'print("Hello")']],
  ['Spoiler', 'Spoiler: hidden until clicked', ['<spoiler>', '</spoiler>', 'hidden text']],
];

export class MarkdownEditor extends Panel {
  /** @param {{text?: string, placeholder?: string, previewer?: (text: string) => Promise<string>}} [options] */
  constructor({ text = '', placeholder = '', previewer = null } = {}) {
    super();
    installStyle();
    this.element.classList.add('cr-md');
    this.bar = document.createElement('div');
    this.bar.className = 'cr-md-bar';
    this.formatButtons = FORMATS.map(([label, title, how]) => {
      const b = this._barButton(label, title, () => this.format(how));
      if (label === 'B') b.style.fontWeight = '700';
      if (label === 'I') b.style.fontStyle = 'italic';
      return b;
    });
    const gap = document.createElement('span');
    gap.className = 'cr-md-gap';
    this.writeButton = this._barButton('Write', 'Write', () => this.setMode('write'));
    this.previewButton = this._barButton('Preview', 'Preview', () => this.setMode('preview'));
    this.bar.append(...this.formatButtons, gap, this.writeButton, this.previewButton);

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'cr-md-text';
    this.textarea.spellcheck = true;
    this.textarea.addEventListener('keydown', (e) => this._key(e));
    this.preview = document.createElement('div');
    this.preview.className = 'cr-md-preview';
    this.preview.addEventListener('click', toggleSpoiler);
    this.element.append(this.bar, this.textarea, this.preview);
    this.previewer = previewer;
    this.placeholder = placeholder;
    this.text = text;
    this._previewToken = 0;
    this.setMode('write');
  }

  _barButton(label, title, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('mousedown', (e) => e.preventDefault());   // keep the selection
    b.addEventListener('click', action);
    return b;
  }

  get text() { return this.textarea.value; }
  set text(value) { this.textarea.value = String(value ?? ''); }

  get placeholder() { return this.textarea.placeholder; }
  set placeholder(value) { this.textarea.placeholder = String(value ?? ''); }

  /** async (text) => html for the Preview tab; null hides it. */
  get previewer() { return this._previewer; }
  set previewer(fn) {
    this._previewer = typeof fn === 'function' ? fn : null;
    this.previewButton.hidden = !this._previewer;
    this.writeButton.hidden = !this._previewer;
  }

  get readOnly() { return this.textarea.readOnly; }
  set readOnly(value) {
    this.textarea.readOnly = Boolean(value);
    for (const b of this.formatButtons) b.disabled = Boolean(value);
  }

  /** 'write' or 'preview'. */
  get mode() { return this._mode; }

  /** Shows the text to edit ('write') or what it will look like ('preview'). */
  async setMode(mode) {
    this._mode = mode === 'preview' && this._previewer ? 'preview' : 'write';
    const preview = this._mode === 'preview';
    this.textarea.hidden = preview;
    this.preview.hidden = !preview;
    for (const b of this.formatButtons) b.hidden = preview;
    this.writeButton.setAttribute('aria-pressed', String(!preview));
    this.previewButton.setAttribute('aria-pressed', String(preview));
    this.element.dispatchEvent(new CustomEvent('mode', { detail: { mode: this._mode } }));
    if (!preview) { this.focus(); return; }
    const token = ++this._previewToken;
    renderHtml(this.preview, '', 'Loading preview...');
    if (!this.text.trim()) { renderHtml(this.preview, '', 'Nothing to preview'); return; }
    try {
      const html = await this._previewer(this.text);
      if (token === this._previewToken) renderHtml(this.preview, html, 'Nothing to preview');
    } catch (e) {
      if (token === this._previewToken) renderHtml(this.preview, '', `Cannot preview: ${e.message}`);
    }
  }

  /** Puts the keyboard focus in the text. */
  focus() { if (this._mode !== 'preview') this.textarea.focus(); }

  /** Adds text where the cursor is (or at the end), e.g. a quote. */
  insert(value) {
    const t = this.textarea;
    const start = t.selectionStart ?? t.value.length;
    const end = t.selectionEnd ?? start;
    t.setRangeText(String(value), start, end, 'end');
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Formats the selection: how is [before, after, placeholder] or (selected) => replacement. */
  format(how) {
    if (this._mode === 'preview' || this.readOnly) return;
    const t = this.textarea;
    const start = t.selectionStart;
    const end = t.selectionEnd;
    const selected = t.value.slice(start, end);
    if (typeof how === 'function') {
      // Line formats start on a line of their own.
      const lineStart = start === 0 || t.value[start - 1] === '\n';
      const out = (lineStart ? '' : '\n') + how(selected);
      t.setRangeText(out, start, end, 'select');
    } else {
      const [before, after, placeholder] = how;
      const inner = selected || placeholder;
      t.setRangeText(before + inner + after, start, end, 'end');
      // Select what is inside, so typing replaces the placeholder.
      const innerStart = start + before.length;
      t.setSelectionRange(innerStart, innerStart + inner.length);
    }
    t.focus();
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }

  _key(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Enter') {
      e.preventDefault();
      this.element.dispatchEvent(new CustomEvent('submit'));
    } else if (k === 'b' || k === 'i' || k === 'k') {
      e.preventDefault();
      this.format(FORMATS[{ b: 0, i: 1, k: 3 }[k]][2]);
    }
  }

  /** A MarkdownEditor holds only its own parts. */
  add() {
    throw new Error('MarkdownEditor cannot contain other widgets');
  }
}
