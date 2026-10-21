// DesignerCodeWindow: the program that builds the design in the Designer, in
// Basic or Python. It follows the design as it is edited. Copy puts the
// program on the clipboard; Save as script keeps it in the user's space (and,
// for a script made here before, rebuilds only its layout section: the code
// written around it is kept). The generator is ../designer-codegen.js.

import { Window } from './window.js';
import { MonacoPanel } from '../widgets/monaco-panel.js';
import { Spacer } from '../widgets/spacer.js';
import { Label } from '../widgets/label.js';
import { LANGUAGES, generateCode, saveAsScript } from '../designer-codegen.js';
import { scriptStore } from '../projects.js';
import { spaceName } from '../db-client.js';

const STORAGE_KEY = 'crumb.designerCodeLanguage';

function savedLanguage() {
  try {
    const id = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (id in LANGUAGES) return id;
  } catch { /* storage blocked */ }
  return 'basic';
}

export class DesignerCodeWindow extends Window {
  /**
   * @param {object} options
   * @param {object} options.designer - the DesignerWindow whose design this shows
   * @param {'basic'|'python'} [options.language] - the language to start in (else the last one used)
   * @param {object} [options.store] - the scripts store for Save as script (tests); the user's space by default
   */
  constructor({ designer, language, store, ...options } = {}) {
    if (!designer) throw new TypeError('DesignerCodeWindow needs a designer');
    super({ title: 'Designer code', x: 150, y: 110, width: 640, height: 480, minWidth: 380, minHeight: 240, ...options });
    this.element.classList.add('cr-designer-code-window');
    this.designer = designer;
    this.store = store ?? null;
    this.language = language in LANGUAGES ? language : savedLanguage();
    this.panel = null;

    const bar = this.buttonBar;
    this.buttons = {};
    for (const [id, lang] of Object.entries(LANGUAGES)) {
      this.buttons[id] = bar.addButton(lang.title, () => this.setLanguage(id));
    }
    bar.add(new Spacer(0)).fixedWidth = 8;
    bar.addButton('Copy', () => this.copy());
    bar.addButton('Save as script', () => this.saveScript());
    bar.add(new Spacer());
    this.statusLabel = bar.add(new Label(''));

    this.element.addEventListener('close', (e) => {
      if (e.target !== this.element) return;
      if (this.designer.codeWindow === this) this.designer.codeWindow = null;
      this.panel?.dispose();
    });
    this.refresh();
  }

  setStatus(text, tone) {
    this.statusLabel.text = text;
    this.statusLabel.tone = tone;
    this.statusLabel.element.title = text;
    this.buttonBar.layout();
  }

  setLanguage(id) {
    if (!(id in LANGUAGES)) return;
    this.language = id;
    try { globalThis.localStorage?.setItem(STORAGE_KEY, id); } catch { /* not remembered */ }
    this.refresh();
  }

  /** The program for the design as it is now. */
  get code() {
    return generateCode(this.designer.root, { language: this.language, name: this.designer.name });
  }

  /** Shows the program again: after the design or the language changed. */
  refresh() {
    for (const [id, button] of Object.entries(this.buttons)) {
      button.label = `${id === this.language ? '✓ ' : ''}${LANGUAGES[id].title}`;
    }
    this.title = `Code - ${this.designer.name || 'untitled'} (${LANGUAGES[this.language].title})`;
    let text;
    try {
      text = this.code;
    } catch (err) {
      this.setStatus(err.message, 'error');
      return;
    }
    const monaco = LANGUAGES[this.language].monaco;
    if (this.panel && this.panel.language === monaco) {
      this.panel.text = text;
    } else {
      const old = this.panel;
      this.panel = new MonacoPanel({ text, language: monaco, readOnly: true });
      this.content = this.panel;
      old?.dispose();
    }
    this.buttonBar.layout();
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.panel.text);
      this.setStatus('Copied');
    } catch {
      this.setStatus('Could not copy: select the text and press Ctrl+C', 'error');
    }
  }

  async saveScript() {
    const space = spaceName();
    if (!space) {
      this.setStatus('Sign in first: scripts are saved in your own space', 'error');
      return;
    }
    const title = LANGUAGES[this.language].title;
    const name = prompt(`Save as a ${title} script called:`, this.designer.name || '');
    if (name === null) return;
    this.setStatus('Saving...');
    try {
      const store = this.store ?? scriptStore().inSpace(space);
      const { action, script, added } = await saveAsScript(store, { name, root: this.designer.root, language: this.language });
      this.setStatus(action === 'created'
        ? `Saved the new script "${script.name}"`
        : `Updated the layout of "${script.name}", kept your code${added.length ? `, added ${added.join(', ')}` : ''}`);
    } catch (err) {
      this.setStatus(err.message, 'error');
    }
  }
}
