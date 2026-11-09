// ForumWindow: the FastBlips forum inside the IDE, opened by the Navbar's
// Forum button. There is one; pressing Forum again brings it to the front.
// Everything is done here - reading, searching, posting, replying, editing,
// following and (for moderators) moderating - through the forum's JSON API
// (forum-client.js), as the signed-in user (File > Sign In).
//
//   +-----------+-------------------------------------------+
//   | Boards    | [Search topics...]           « ‹ 1/3 › »  |
//   |  FASTBLIPS| Topic        Started by  Replies  Last post|
//   |  # Ideas  | ...                                       |
//   |  LEARNING +-------------------------------------------+
//   |  # Python | Topic title                               |
//   |  ...      | board · started by · replies              |
//   |           | [post card] [post card] ...               |
//   |           | status                       « ‹ 1/2 › »  |
//   +-----------+-------------------------------------------+
//   [New Topic] [Reply] [Follow] [Topic ▾] [Refresh] [Moderation]   user
//
// The boards come in their groups, with a count of unread topics when signed
// in, and Unread topics at the top. A board lists its topics, pinned first,
// then by latest post; topics with unread posts are bold. Searching (Enter
// in the search field) lists matching topics from every board. Choosing a
// topic shows its posts below, a page at a time, and marks them read. Each
// post has Quote, Edit, Delete and (moderators) Approve and Block, as this
// user may. New Topic, Reply and Edit open a ForumComposeWindow.

import { HSplitWindow } from './hsplit-window.js';
import { ForumComposeWindow } from './forum-compose-window.js';
import { ForumModerationWindow } from './forum-moderation-window.js';
import { VPanel } from '../widgets/vpanel.js';
import { HPanel } from '../widgets/hpanel.js';
import { VSplitPanel } from '../widgets/vsplit-panel.js';
import { ListPanel } from '../widgets/list-panel.js';
import { GridPanel } from '../widgets/grid-panel.js';
import { CardListPanel } from '../widgets/card-list-panel.js';
import { TextField } from '../widgets/text-field.js';
import { Pager } from '../widgets/pager.js';
import { Label } from '../widgets/label.js';
import { Menu } from '../widgets/menu.js';
import { Spacer } from '../widgets/spacer.js';
import { Toast } from '../toast.js';
import { userName, forumLink } from '../db-client.js';
import {
  ForumClient, boardItems, allBoards, topicRow, postCard, topicSummary, postingProblem,
} from '../forum-client.js';

const UNREAD = ':unread';

export class ForumWindow extends HSplitWindow {
  static get instance() {
    if (!this._instance) this._instance = new ForumWindow();
    return this._instance;
  }

  /** @param {{client?: ForumClient}} [options] - how the forum is reached (tests) */
  constructor({ client } = {}) {
    super({ title: 'Forum', x: 120, y: 60, width: 1040, height: 640, minWidth: 640, minHeight: 360, position: 0.2 });
    this.element.classList.add('cr-forum-window');
    this.client = client ?? new ForumClient();
    this.overview = null;       // { user, groups }
    this.view = null;           // { kind: 'board', board } | { kind: 'unread' } | { kind: 'search', q }
    this.topicsPage = 1;
    this.topicList = [];        // the topics shown in the grid
    this.topic = null;          // the topic shown below, as the server last sent it
    this.posts = [];
    this.postsPage = 1;
    this._tokens = { overview: 0, topics: 0, posts: 0 };

    // ---- the left: boards
    this.boardList = new ListPanel({ emptyText: 'Loading...' });
    this.boardList.element.addEventListener('select', (e) => {
      const value = e.detail.item?.value;
      if (value === UNREAD) this.showUnread();
      else if (value) this.showBoard(value);
    });
    this.left = this.boardList;

    // ---- the right: topics above, posts below
    this.searchField = new TextField('');
    this.searchField.placeholder = 'Search topics in every board (Enter)';
    this.searchField.flex = 1;
    this.searchField.element.addEventListener('submit', () => this.search(this.searchField.text));
    this.searchField.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.searchField.text) { this.searchField.text = ''; this.search(''); }
    });
    this.topicsPager = new Pager();
    this.topicsPager.element.addEventListener('change', (e) => this.loadTopics(e.detail.page));
    const topicsBar = new HPanel({ padding: [3, 4, 3, 4], spacing: 6 });
    topicsBar.fixedHeight = 30;
    topicsBar.add(this.searchField);
    topicsBar.add(this.topicsPager);
    this.topicsGrid = new GridPanel({
      columns: [{ label: 'Topic' }, { label: 'Started by', width: '110px' }, { label: 'Replies', width: '72px' },
        { label: 'Last post', width: '160px' }],
      emptyText: 'Choose a board',
    });
    this.topicsGrid.flex = 1;
    this.topicsGrid.element.addEventListener('select', (e) => {
      const slug = e.detail.row?.value;
      if (slug && slug !== this.topic?.slug) this.showTopic(slug);
    });
    const topicsPane = new VPanel();
    topicsPane.add(topicsBar);
    topicsPane.add(this.topicsGrid);

    this.postList = new CardListPanel({ emptyText: 'Choose a topic to read it' });
    this.postList.flex = 1;
    this.postList.element.addEventListener('action', (e) => this.postAction(e.detail.action, e.detail.item.value));
    this.statusLabel = new Label('');
    this.statusLabel.flex = 1;
    this.postsPager = new Pager();
    this.postsPager.element.addEventListener('change', (e) => this.loadPosts(e.detail.page));
    const postsBar = new HPanel({ padding: [3, 4, 3, 4], spacing: 6 });
    postsBar.fixedHeight = 30;
    postsBar.element.style.borderTop = '1px solid var(--cr-divider)';
    postsBar.add(this.statusLabel);
    postsBar.add(this.postsPager);
    const postsPane = new VPanel();
    postsPane.add(this.postList);
    postsPane.add(postsBar);

    this.rightSplit = new VSplitPanel({ first: topicsPane, second: postsPane, position: 0.38, minSize: 90 });
    this.right = this.rightSplit;

    // ---- the buttons
    this.newTopicButton = this.buttonBar.addButton('New Topic', () => this.newTopic());
    this.replyButton = this.buttonBar.addButton('Reply', () => this.reply());
    this.followButton = this.buttonBar.addButton('Follow', () => this.toggleFollow());
    this.topicMenu = this.buttonBar.add(new Menu('Topic'));
    this._buildTopicMenu();
    this.refreshButton = this.buttonBar.addButton('Refresh', () => this.refresh());
    this.moderationButton = this.buttonBar.addButton('Moderation', () => this.openModeration());
    this.buttonBar.add(new Spacer());
    this.userLabel = this.buttonBar.add(new Label(''));

    this._reload = () => { if (this.isOpen) this.refresh({ keepTopic: false }); else this._stale = true; };
    document.addEventListener('cr-userchange', this._reload);
    document.addEventListener('cr-dbserverchange', this._reload);
    this._stale = true;
    this.updateButtons();
  }

  _buildTopicMenu() {
    const m = this.topicMenu;
    const t = () => this.topic;
    m.addItem('Edit Topic...', () => this.editTopic(), { enabled: () => Boolean(t()?.can_edit) });
    m.addItem(() => (t()?.sticky ? 'Unpin' : 'Pin to Top'), () => this.setTopicFlag('sticky', !t().sticky),
      { visible: () => Boolean(t()?.can_moderate), enabled: () => Boolean(t()) });
    m.addItem(() => (t()?.locked ? 'Unlock' : 'Lock (no more replies)'), () => this.setTopicFlag('locked', !t().locked),
      { visible: () => Boolean(t()?.can_moderate), enabled: () => Boolean(t()) });
    m.addItem('Delete Topic...', () => this.deleteTopic(), {
      visible: () => Boolean(t()?.can_delete), enabled: () => Boolean(t()),
    });
    m.addSeparator();
    m.addItem('Go to First Post', () => this.loadPosts(1), { enabled: () => Boolean(t()) });
    m.addItem('Go to Latest Post', () => this.loadPosts('last'), { enabled: () => Boolean(t()) });
    m.addSeparator();
    m.addItem('Open in Browser', () => this.openInBrowser(), { enabled: () => Boolean(t()) });
  }

  // ---- what the window shows -----------------------------------------------------

  get user() { return this.overview?.user ?? null; }

  /** The boards, with what this user may do in each. */
  get boards() { return allBoards(this.overview?.groups); }

  /** The board being shown, or null (Unread topics, a search). */
  get board() {
    return this.view?.kind === 'board' ? this.boards.find((b) => b.slug === this.view.board) ?? null : null;
  }

  /**
   * Reads the boards again, then the topics and the topic being shown. With
   * keepTopic false (a new user or server), the topic is closed. Resolves
   * once everything is up to date.
   */
  async refresh({ keepTopic = true } = {}) {
    this._stale = false;
    const token = ++this._tokens.overview;
    this.boardList.emptyText = 'Loading...';
    let overview;
    try {
      overview = await this.client.overview();
    } catch (e) {
      if (token !== this._tokens.overview) return;
      this.overview = null;
      this.boardList.items = [];
      this.boardList.emptyText = `Cannot reach the forum: ${e.message}`;
      this.updateButtons();
      return;
    }
    if (token !== this._tokens.overview) return;
    this.overview = overview;
    this.boardList.items = boardItems(overview.groups, { unreadItem: Boolean(overview.user) });
    this.boardList.emptyText = 'There are no boards yet';
    if (!keepTopic) this._clearTopic();
    // Stay where we were; else the first board.
    const view = this.view;
    if (view?.kind === 'unread' && !overview.user) this.view = null;
    if (view?.kind === 'board' && !this.boards.some((b) => b.slug === view.board)) this.view = null;
    if (!this.view && this.boards.length) this.view = { kind: 'board', board: this.boards[0].slug };
    this._selectViewInList();
    const work = [this.loadTopics(this.topicsPage)];
    if (keepTopic && this.topic) work.push(this.loadPosts(this.postsPage));
    this.updateButtons();
    await Promise.all(work);
  }

  _selectViewInList() {
    const value = this.view?.kind === 'board' ? this.view.board : this.view?.kind === 'unread' ? UNREAD : undefined;
    const index = this.boardList.items.findIndex((i) => !i.header && i.value === value);
    if (index !== this.boardList.selectedIndex) {
      this._quiet = true;
      this.boardList.select(index);
      this._quiet = false;
    }
  }

  /** Shows a board's topics (by slug). */
  showBoard(slug) {
    if (this._quiet) return null;
    this.searchField.text = '';
    this.view = { kind: 'board', board: slug };
    this.updateButtons();
    return this.loadTopics(1);
  }

  /** Shows the topics with posts not yet read. */
  showUnread() {
    if (this._quiet) return null;
    this.searchField.text = '';
    this.view = { kind: 'unread' };
    this.updateButtons();
    return this.loadTopics(1);
  }

  /** Lists the topics matching q in every board; '' goes back to the board. */
  search(q) {
    q = String(q ?? '').trim();
    if (!q) {
      if (this.view?.kind !== 'search') return null;
      this.view = this._beforeSearch ?? (this.boards[0] ? { kind: 'board', board: this.boards[0].slug } : null);
      this._selectViewInList();
      return this.loadTopics(1);
    }
    if (this.view?.kind !== 'search') this._beforeSearch = this.view;
    this.view = { kind: 'search', q };
    this._quiet = true;
    this.boardList.select(-1);
    this._quiet = false;
    this.updateButtons();
    return this.loadTopics(1);
  }

  /** Reads a page of the topics for the current view and shows them. */
  async loadTopics(page = 1) {
    const view = this.view;
    const token = ++this._tokens.topics;
    if (!view) { this.topicsGrid.rows = []; this.topicsGrid.emptyText = 'Choose a board'; return; }
    this.topicsGrid.emptyText = 'Loading...';
    let answer;
    try {
      answer = view.kind === 'board' ? await this.client.topics(view.board, { page })
        : view.kind === 'unread' ? await this.client.unread({ page })
          : await this.client.search(view.q, { page });
    } catch (e) {
      if (token !== this._tokens.topics) return;
      this.topicList = [];
      this.topicsGrid.rows = [];
      this.topicsGrid.emptyText = `Cannot read the topics: ${e.message}`;
      return;
    }
    if (token !== this._tokens.topics) return;
    this.topicList = answer.topics ?? [];
    this.topicsPage = answer.page ?? 1;
    this.topicsPager.set(this.topicsPage, answer.total_pages);
    this.topicsGrid.rows = this.topicList.map((t) => topicRow(t, { showBoard: view.kind !== 'board' }));
    this.topicsGrid.emptyText = view.kind === 'search' ? `No topics match "${view.q}"`
      : view.kind === 'unread' ? 'You have read everything' : 'No topics yet: start one with New Topic';
    // Keep the topic shown selected, if it is in the list.
    const index = this.topicsGrid.rows.findIndex((r) => r.value === this.topic?.slug);
    if (index >= 0) this.topicsGrid.select(index);
    this.updateButtons();
  }

  /** Shows a topic (by slug or id) below the topics, at page (1, or 'last'). */
  showTopic(slug, page = 1) {
    this.topic = { slug, title: '' };
    this.posts = [];
    this.postList.heading = '';
    this.postList.subheading = '';
    this.postList.items = [];
    this.postList.emptyText = 'Loading...';
    this.updateButtons();
    return this.loadPosts(page);
  }

  /** Reads a page of the topic's posts (a number or 'last') and shows them. */
  async loadPosts(page = 1, { scrollTo } = {}) {
    if (!this.topic) return;
    const slug = this.topic.slug;
    const token = ++this._tokens.posts;
    this._status('Loading...');
    let answer;
    try {
      answer = await this.client.topic(slug, { page });
    } catch (e) {
      if (token !== this._tokens.posts) return;
      this._status(`Cannot read the topic: ${e.message}`, 'error');
      if (e.status === 404) { this.postList.items = []; this.postList.emptyText = 'This topic is not there any more'; }
      return;
    }
    if (token !== this._tokens.posts) return;
    this.topic = answer.topic;
    this.posts = answer.posts ?? [];
    this.postsPage = answer.page ?? 1;
    this.postsPager.set(this.postsPage, answer.total_pages);
    this._showPosts();
    if (scrollTo === 'end') this.postList.scrollToEnd();
    else if (scrollTo != null) this.postList.scrollToItem(scrollTo);
    else this.postList.scrollToTop();
    this._status('');
    this._markReadInList();
    this.updateButtons();
  }

  _showPosts() {
    const t = this.topic;
    this.postList.heading = t.title;
    this.postList.subheading = topicSummary(t);
    this.postList.emptyText = 'No posts to show';
    this.postList.items = this.posts.map((p) => postCard(p, { canReply: t.can_reply }));
  }

  // Reading a topic marks it read: unbold it in the grid, and count it off its board.
  _markReadInList() {
    const listed = this.topicList.find((t) => t.slug === this.topic?.slug);
    if (!listed || !listed.unread) return;
    listed.unread = false;
    const view = this.view;
    this.topicsGrid.rows = this.topicList.map((t) => topicRow(t, { showBoard: view?.kind !== 'board' }));
    const board = this.boards.find((b) => b.slug === listed.board?.slug);
    if (board && board.unread_topics_count) {
      board.unread_topics_count -= 1;
      this.boardList.items = boardItems(this.overview.groups, { unreadItem: Boolean(this.user) });
    }
  }

  _clearTopic() {
    this.topic = null;
    this.posts = [];
    this.postList.heading = '';
    this.postList.subheading = '';
    this.postList.items = [];
    this.postList.emptyText = 'Choose a topic to read it';
    this.postsPager.set(1, 1);
    this._status('');
  }

  _status(text, tone) {
    this.statusLabel.text = text;
    this.statusLabel.tone = tone;
  }

  _toast(message, kind = 'info') {
    if (this.parent) Toast.show(this.parent, { message, kind });
  }

  // ---- doing things ----------------------------------------------------------------

  /** Opens a New Topic window for the board being shown. */
  newTopic() {
    const problem = postingProblem({ user: this.user });
    if (problem) { this._toast(problem, 'error'); return null; }
    if (!this.boards.some((b) => b.can_post)) { this._toast('There is no board you can post in', 'error'); return null; }
    const start = this.board?.can_post ? this.board.slug : '';
    return new ForumComposeWindow({
      mode: 'topic', boards: this.boards, board: start, moderator: Boolean(this.user?.moderator), client: this.client,
      onDone: (answer) => this._posted(answer, { newTopic: true }),
    }).open(this.parent);
  }

  /** Opens a Reply window for the topic shown (or adds quote to one already open). */
  reply(quote = '') {
    const problem = postingProblem({ user: this.user, topic: this.topic });
    if (problem) { this._toast(problem, 'error'); return null; }
    const open = this.parent?.windows?.find((w) => w instanceof ForumComposeWindow && w.mode === 'reply'
      && w.topic?.id === this.topic.id && w.isOpen);
    if (open) {
      open.open(this.parent);
      if (quote) open.addQuote(quote);
      return open;
    }
    return new ForumComposeWindow({
      mode: 'reply', topic: this.topic, text: quote, client: this.client,
      onDone: (answer) => this._posted(answer),
    }).open(this.parent);
  }

  // After a topic or reply was posted: show it, and say if it waits for a moderator.
  async _posted(answer, { newTopic = false } = {}) {
    const post = answer?.post;
    if (post?.moderation_state === 'pending_moderation') {
      this._toast('Thanks! A moderator will look at your post before others can see it.', 'info');
    } else this._toast(newTopic ? 'Topic posted' : 'Reply posted', 'success');
    if (newTopic && answer?.topic) {
      const board = answer.topic.board?.slug;
      if (board) { this.view = { kind: 'board', board }; this.searchField.text = ''; this._selectViewInList(); }
      this.showTopic(answer.topic.slug);
      await this.loadTopics(1);
    } else {
      await this.loadPosts('last', { scrollTo: post?.id ?? 'end' });
      this.loadTopics(this.topicsPage);
    }
  }

  /** Follows the topic shown, or stops following it. */
  async toggleFollow() {
    const t = this.topic;
    if (!t?.id || !this.user) return;
    try {
      t.following = await this.client.follow(t.slug, !t.following);
      this.postList.subheading = topicSummary(t);
      this._toast(t.following ? 'Following: replies will show in Unread topics' : 'No longer following', 'info');
    } catch (e) { this._toast(e.message, 'error'); }
    this.updateButtons();
  }

  /** Opens the Edit Topic window. */
  editTopic() {
    if (!this.topic?.can_edit) return null;
    return new ForumComposeWindow({
      mode: 'edit-topic', topic: this.topic, boards: this.boards, moderator: Boolean(this.topic.can_moderate),
      client: this.client,
      onDone: () => { this._toast('Topic saved', 'success'); this.refresh(); },
    }).open(this.parent);
  }

  /** Pins or locks the topic shown (moderators). */
  async setTopicFlag(flag, value) {
    try {
      const { topic } = await this.client.updateTopic(this.topic.slug, { [flag]: value });
      this.topic = { ...this.topic, ...topic };
      this._showPosts();
      this.loadTopics(this.topicsPage);
    } catch (e) { this._toast(e.message, 'error'); }
    this.updateButtons();
  }

  /** Deletes the topic shown, after asking (administrators). */
  async deleteTopic() {
    const t = this.topic;
    if (!t?.can_delete || !globalThis.confirm?.(`Delete the topic "${t.title}" and all its posts?`)) return;
    try {
      await this.client.deleteTopic(t.slug);
      this._toast('Topic deleted', 'success');
      this._clearTopic();
      this.refresh();
    } catch (e) { this._toast(e.message, 'error'); }
  }

  /** Does what a post's action link asks: quote, edit, delete, approve or block. */
  async postAction(action, id) {
    const post = this.posts.find((p) => p.id === id);
    if (!post) return;
    try {
      if (action === 'quote') {
        this.reply((await this.client.quote(id)) ?? '');
      } else if (action === 'edit') {
        new ForumComposeWindow({
          mode: 'edit-post', topic: this.topic, post, client: this.client,
          onDone: ({ post: saved }) => this._replacePost(saved),
        }).open(this.parent);
      } else if (action === 'delete') {
        if (!globalThis.confirm?.(`Delete this post by ${post.user?.name}?`)) return;
        this.postList.busy = true;
        await this.client.deletePost(id);
        this._toast('Post deleted', 'success');
        await this.loadPosts(this.postsPage);
      } else if (action === 'approve' || action === 'block') {
        this.postList.busy = true;
        const { post: moderated } = await this.client.moderatePost(id, action === 'approve' ? 'approved' : 'blocked');
        this._replacePost({ ...post, ...moderated });
        this._toast(action === 'approve' ? `Approved ${post.user?.name}'s post` : `Blocked ${post.user?.name}'s post`, 'success');
      }
    } catch (e) {
      this._toast(e.message, 'error');
    } finally {
      this.postList.busy = false;
    }
  }

  _replacePost(saved) {
    if (!saved) return;
    const i = this.posts.findIndex((p) => p.id === saved.id);
    if (i < 0) return;
    this.posts[i] = { ...this.posts[i], ...saved };
    this.postList.replaceItem(saved.id, postCard(this.posts[i], { canReply: this.topic?.can_reply }));
  }

  /** Opens the Forum Moderation window (moderators). */
  openModeration() {
    if (!this.user?.moderator) return null;
    const win = ForumModerationWindow.instance;
    win.client = this.client;
    win.onChange = () => this.refresh();
    return win.open(this.parent);
  }

  /** Opens the topic shown on forum.fastblips.com in a new tab, signed in. */
  async openInBrowser() {
    const t = this.topic;
    if (!t?.board) return;
    const path = `/${t.board.slug}/${t.slug}`;
    const tab = globalThis.open?.('about:blank', '_blank');
    const url = await forumLink({ returnTo: path });
    if (tab && !tab.closed) { tab.opener = null; tab.location.replace(url); } else globalThis.open?.(url, '_blank', 'noopener');
  }

  updateButtons() {
    const user = this.user;
    const t = this.topic;
    const loaded = Boolean(t?.id);
    this.newTopicButton.enabled = Boolean(this.overview);
    this.replyButton.enabled = loaded;
    this.followButton.enabled = loaded && Boolean(user);
    this.followButton.label = t?.following ? 'Unfollow' : 'Follow';
    this.topicMenu.button.disabled = !loaded;
    this.moderationButton.visible = Boolean(user?.moderator);
    const standing = user?.moderation_state === 'pending_moderation' ? ' (new: posts are checked first)'
      : user?.moderation_state === 'blocked' ? ' (blocked)' : '';
    this.userLabel.text = !this.overview ? '' : user ? `Posting as ${user.name}${standing}` : 'Reading only: sign in to post';
    this.buttonBar.layout();
  }

  /** Shows the window and reads the forum (afresh if the user or server changed). */
  open(viewport) {
    super.open(viewport);
    if (this._stale || !this.overview) this.refresh({ keepTopic: false });
    if (!userName()) this.updateButtons();
    return this;
  }
}
