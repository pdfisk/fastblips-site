// ForumComposeWindow: writing for the forum, opened from the Forum window. One
// window does each kind of writing, by its mode:
//
//   'topic'       a new topic: Title, Board, the first post; moderators can
//                 also pin it (Pinned) and lock it (Locked)
//   'reply'       a reply in a topic (Quote in the Forum window adds to it)
//   'edit-post'   changes the text of a post
//   'edit-topic'  changes a topic's title; moderators can also move, pin and
//                 lock it (there is no post to write, so no editor)
//
// The text is Markdown in a MarkdownEditor, with a Preview from the server.
// Post (or Ctrl+Enter) sends it; the window closes when the server has it and
// calls onDone with the server's answer. Closing a window with unsent
// writing asks first. Several can be open at once (a reply while starting a
// topic), each cascading from the last.

import { Window } from './window.js';
import { VPanel } from '../widgets/vpanel.js';
import { HPanel } from '../widgets/hpanel.js';
import { Label } from '../widgets/label.js';
import { TextField } from '../widgets/text-field.js';
import { SelectBox } from '../widgets/select-box.js';
import { CheckBox } from '../widgets/check-box.js';
import { Spacer } from '../widgets/spacer.js';
import { MarkdownEditor } from '../widgets/markdown-editor.js';
import { ForumClient } from '../forum-client.js';

const TITLES = { topic: 'New Topic', reply: 'Reply', 'edit-post': 'Edit Post', 'edit-topic': 'Edit Topic' };
const ACTIONS = { topic: 'Post Topic', reply: 'Post Reply', 'edit-post': 'Save', 'edit-topic': 'Save' };

let opened = 0;

/** A row of the form: a label of fixed width, then the field. */
function formRow(text, field, labelWidth = 64) {
  const row = new HPanel({ spacing: 6 });
  const label = new Label(text);
  label.fixedWidth = labelWidth;
  label.element.style.color = 'var(--cr-text)';
  label.element.style.paddingLeft = '0';
  field.flex = 1;
  row.add(label);
  row.add(field);
  row.fixedHeight = 26;
  return row;
}

export class ForumComposeWindow extends Window {
  /**
   * @param {object} options
   * @param {'topic'|'reply'|'edit-post'|'edit-topic'} options.mode
   * @param {object} [options.topic] - the topic replied to or edited
   * @param {object} [options.post] - the post edited (with its content)
   * @param {object[]} [options.boards] - the boards: where a topic may go
   * @param {string} [options.board] - the board a new topic starts in (slug)
   * @param {boolean} [options.moderator] - whether to offer Pinned, Locked and moving
   * @param {string} [options.text] - the text to start with (a quote)
   * @param {(answer: object, window: ForumComposeWindow) => void} [options.onDone]
   * @param {ForumClient} [options.client]
   */
  constructor({ mode = 'reply', topic = null, post = null, boards = [], board = '', moderator = false,
    text = '', onDone = null, client = null } = {}) {
    if (!TITLES[mode]) throw new TypeError(`unknown compose mode '${mode}'`);
    const offset = (opened++ % 6) * 24;
    const short = mode === 'edit-topic';
    super({ title: TITLES[mode], x: 260 + offset, y: 110 + offset, width: 620, height: short ? 230 : 460,
      minWidth: 420, minHeight: short ? 200 : 300 });
    this.element.classList.add('cr-forum-compose-window');
    this.mode = mode;
    this.topic = topic;
    this.post = post;
    this.onDone = onDone;
    this.client = client ?? new ForumClient();
    this.busy = false;
    if (topic && mode !== 'topic') this.title = `${TITLES[mode]}: ${topic.title}`;

    const form = new VPanel({ padding: 8, spacing: 6 });
    this.form = form;
    // Title: a new topic, or a topic being edited.
    if (mode === 'topic' || mode === 'edit-topic') {
      this.titleField = new TextField(mode === 'edit-topic' ? topic?.title ?? '' : '');
      this.titleField.placeholder = 'What is your topic about?';
      this.titleField.maxLength = 200;
      form.add(formRow('Title', this.titleField));
      this.titleField.element.addEventListener('input', () => this.updateButtons());
      this.titleField.element.addEventListener('submit', () => { if (short) this.send(); else this.editor.focus(); });
    }
    // Board: where a new topic goes (where it may post), or (moderators) where a topic moves to.
    if (mode === 'topic' || (mode === 'edit-topic' && moderator)) {
      this.boards = boards.filter((b) => b.can_post || b.slug === topic?.board?.slug);
      this.boardBox = new SelectBox();
      for (const b of this.boards) this.boardBox.addItem(b.name);
      const start = this.boards.findIndex((b) => b.slug === (topic?.board?.slug ?? board));
      this.boardBox.select(Math.max(0, start));
      form.add(formRow('Board', this.boardBox));
    }
    if ((mode === 'topic' || mode === 'edit-topic') && moderator) {
      const row = new HPanel({ spacing: 16 });
      row.fixedHeight = 22;
      const indent = new Spacer(0);
      indent.fixedWidth = 64;
      this.stickyBox = new CheckBox('Pinned (stays at the top)', Boolean(topic?.sticky));
      this.lockedBox = new CheckBox('Locked (no more replies)', Boolean(topic?.locked));
      row.add(indent);
      row.add(this.stickyBox);
      row.add(this.lockedBox);
      form.add(row);
    }
    if (!short) {
      this.editor = new MarkdownEditor({
        text: mode === 'edit-post' ? post?.content ?? '' : text,
        placeholder: mode === 'topic'
          ? 'Say what you are trying to do, what you tried, and what happened. Paste code with the { } button.'
          : 'Write your reply. Markdown works: **bold**, _italic_, `code`.',
        previewer: (t) => this.client.preview(t),
      });
      this.editor.flex = 1;
      form.add(this.editor);
      this.editor.textarea.addEventListener('input', () => { this._error(''); this.updateButtons(); });
      this.editor.element.addEventListener('submit', () => this.send());
    }
    this.errorLabel = new Label('');
    this.errorLabel.tone = 'error';
    this.errorLabel.fixedHeight = 18;
    this.errorLabel.element.style.paddingLeft = '0';
    form.add(this.errorLabel);
    this.content = form;

    this.sendButton = this.buttonBar.addButton(ACTIONS[mode], () => this.send());
    this.buttonBar.addButton('Cancel', () => this.close());
    this.buttonBar.add(new Spacer());
    this.hint = this.buttonBar.add(new Label(short ? '' : 'Ctrl+Enter to post'));
    this._initial = this._snapshot();
    // Unsent writing is not thrown away without asking.
    this.element.addEventListener('close', (e) => {
      if (this._sent || this._snapshot() === this._initial) return;
      if (!globalThis.confirm?.('Discard what you have written?')) e.preventDefault();
    });
    this.updateButtons();
  }

  _snapshot() {
    return JSON.stringify([this.titleField?.text ?? '', this.editor?.text ?? '', this.boardBox?.selectedIndex ?? -1,
      this.stickyBox?.checked ?? null, this.lockedBox?.checked ?? null]);
  }

  /** The text written, trimmed of trailing space. */
  get text() { return (this.editor?.text ?? '').replace(/\s+$/, ''); }

  /** The board chosen, or null. */
  get selectedBoard() { return this.boards?.[this.boardBox?.selectedIndex] ?? null; }

  /** Adds a quote to the text (Quote in the Forum window). */
  addQuote(quote) {
    if (!this.editor) return;
    if (this.editor.mode !== 'write') this.editor.setMode('write');
    const before = this.editor.text;
    this.editor.textarea.setSelectionRange(before.length, before.length);
    this.editor.insert(`${before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}${quote}`);
    this.editor.focus();
  }

  updateButtons() {
    const title = this.titleField ? this.titleField.text.trim() !== '' : true;
    const body = this.editor ? this.text.trim() !== '' : true;
    this.sendButton.enabled = !this.busy && title && body;
    this.buttonBar.layout();
  }

  _error(message) {
    this.errorLabel.text = message;
  }

  /** Sends the writing to the server; resolves to its answer, or null if it was refused. */
  async send() {
    if (this.busy) return null;
    this.updateButtons();
    if (!this.sendButton.enabled) return null;
    this.busy = true;
    this._error('');
    this.sendButton.label = 'Sending...';
    this.updateButtons();
    let answer;
    try {
      answer = await this._request();
    } catch (e) {
      this.busy = false;
      this.sendButton.label = ACTIONS[this.mode];
      this._error(e?.message || 'The server did not take it');
      this.updateButtons();
      return null;
    }
    this._sent = true;
    this.busy = false;
    this.close();
    this.onDone?.(answer, this);
    return answer;
  }

  _request() {
    const c = this.client;
    switch (this.mode) {
      case 'topic': {
        const board = this.selectedBoard;
        if (!board) throw new Error('Choose a board');
        return c.createTopic(board.slug, {
          title: this.titleField.text.trim(), content: this.text,
          sticky: this.stickyBox?.checked || undefined, locked: this.lockedBox?.checked || undefined,
        });
      }
      case 'reply': return c.reply(this.topic.slug, this.text);
      case 'edit-post': return c.editPost(this.post.id, this.text);
      default: {
        const fields = { title: this.titleField.text.trim() };
        if (this.stickyBox) { fields.sticky = this.stickyBox.checked; fields.locked = this.lockedBox.checked; }
        const board = this.selectedBoard;
        if (board && board.slug !== this.topic.board?.slug) fields.board = board.slug;
        return c.updateTopic(this.topic.slug, fields);
      }
    }
  }

  open(viewport) {
    super.open(viewport);
    (this.titleField ?? this.editor)?.focus();
    return this;
  }
}
