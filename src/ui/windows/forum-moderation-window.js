// ForumModerationWindow: moderating the forum from the IDE, for moderators
// and administrators; opened by the Forum window's Moderation button. One
// window, with four tabs:
//
//   Pending   posts waiting for approval, oldest first. Approve shows the
//             post and approves its author, so their later posts appear at
//             once; Block hides it (and, for a topic's first post, the topic).
//   Activity  every post, newest first, with Approve and Block
//   Users     everyone, newest to the forum first, with their standing:
//             Approve, Block or Reset (back to having posts checked)
//   History   what moderators decided, newest first
//
// New users' posts are held for approval because FastBlips' first users
// are learners (rails/config/initializers/thredded.rb).

import { Window } from './window.js';
import { TabPanel } from '../widgets/tab-panel.js';
import { VPanel } from '../widgets/vpanel.js';
import { HPanel } from '../widgets/hpanel.js';
import { CardListPanel } from '../widgets/card-list-panel.js';
import { GridPanel } from '../widgets/grid-panel.js';
import { TextField } from '../widgets/text-field.js';
import { Pager } from '../widgets/pager.js';
import { Spacer } from '../widgets/spacer.js';
import { Label } from '../widgets/label.js';
import { Toast } from '../toast.js';
import { ForumClient, postCard, relativeTime, MODERATION_LABELS } from '../forum-client.js';

/** A post in a moderation list: where it is, and Approve / Block. */
export function moderationCard(post) {
  const card = postCard({ ...post, can_edit: false, can_delete: false, can_moderate: true });
  card.context = `${post.board?.name ?? ''} › ${post.topic?.title ?? ''}${post.first ? ' (new topic)' : ''}`;
  if (post.user_moderation_state === 'pending_moderation') card.badges.push({ label: 'new user' });
  return card;
}

/** A row of the Users grid. */
export function userRow(u) {
  return {
    value: u.id,
    cells: [u.name + (u.staff ? ' ★' : ''), MODERATION_LABELS[u.moderation_state] ?? u.moderation_state,
      String(u.posts_count ?? 0), relativeTime(u.last_seen_at)],
    sort: [u.name.toLowerCase(), u.moderation_state, u.posts_count ?? 0, u.last_seen_at ?? ''],
    emphasis: u.moderation_state === 'pending_moderation',
  };
}

/** A row of the History grid. */
export function historyRow(r) {
  return {
    value: r.id,
    cells: [relativeTime(r.created_at), r.moderator ?? '', r.user ?? '',
      MODERATION_LABELS[r.moderation_state] ?? r.moderation_state, r.topic ?? '(deleted)'],
    sort: [r.created_at ?? '', r.moderator ?? '', r.user ?? '', r.moderation_state, r.topic ?? ''],
    title: r.content,
  };
}

/** A tab that lists posts a page at a time, as cards with Approve and Block. */
class PostsTab extends VPanel {
  constructor(emptyText) {
    super();
    this.cards = new CardListPanel({ emptyText });
    this.cards.flex = 1;
    this.pager = new Pager();
    const bar = new HPanel({ padding: [3, 4, 3, 4] });
    bar.fixedHeight = 30;
    bar.element.style.borderTop = '1px solid var(--cr-divider)';
    this.count = new Label('');
    this.count.flex = 1;
    bar.add(this.count);
    bar.add(this.pager);
    this.add(this.cards);
    this.add(bar);
  }
}

export class ForumModerationWindow extends Window {
  static get instance() {
    if (!this._instance) this._instance = new ForumModerationWindow();
    return this._instance;
  }

  /** @param {{client?: ForumClient}} [options] */
  constructor({ client } = {}) {
    super({ title: 'Forum Moderation', x: 200, y: 90, width: 760, height: 560, minWidth: 480, minHeight: 300 });
    this.element.classList.add('cr-forum-moderation-window');
    this.client = client ?? new ForumClient();
    this.onChange = null;        // called after a decision (the Forum window refreshes)
    this.pages = { pending: 1, activity: 1, users: 1, history: 1 };
    this.lists = { pending: [], activity: [], users: [], history: [] };

    this.pendingTab = new PostsTab('Nothing is waiting: all caught up');
    this.activityTab = new PostsTab('No posts yet');
    for (const [name, tab] of [['pending', this.pendingTab], ['activity', this.activityTab]]) {
      tab.pager.element.addEventListener('change', (e) => this.load(name, e.detail.page));
      tab.cards.element.addEventListener('action', (e) => this.moderatePost(name, e.detail.item.value, e.detail.action));
    }

    this.userSearch = new TextField('');
    this.userSearch.placeholder = 'Find users by name (Enter)';
    this.userSearch.flex = 1;
    this.userSearch.element.addEventListener('submit', () => this.load('users', 1));
    this.usersPager = new Pager();
    this.usersPager.element.addEventListener('change', (e) => this.load('users', e.detail.page));
    const usersBar = new HPanel({ padding: [3, 4, 3, 4], spacing: 6 });
    usersBar.fixedHeight = 30;
    usersBar.add(this.userSearch);
    usersBar.add(this.usersPager);
    this.usersGrid = new GridPanel({
      columns: [{ label: 'Name' }, { label: 'Standing', width: '140px' }, { label: 'Posts', width: '64px' },
        { label: 'Last seen', width: '110px' }],
      emptyText: 'Loading...',
    });
    this.usersGrid.flex = 1;
    this.usersGrid.element.addEventListener('select', () => this.updateButtons());
    const usersTab = new VPanel();
    usersTab.add(usersBar);
    usersTab.add(this.usersGrid);

    this.historyGrid = new GridPanel({
      columns: [{ label: 'When', width: '100px' }, { label: 'Moderator', width: '100px' }, { label: 'User', width: '100px' },
        { label: 'Decision', width: '90px' }, { label: 'Topic' }],
      emptyText: 'Loading...',
    });
    this.historyGrid.flex = 1;
    this.historyPager = new Pager();
    this.historyPager.element.addEventListener('change', (e) => this.load('history', e.detail.page));
    const historyBar = new HPanel({ padding: [3, 4, 3, 4] });
    historyBar.fixedHeight = 30;
    historyBar.add(new Spacer());
    historyBar.add(this.historyPager);
    const historyTab = new VPanel();
    historyTab.add(this.historyGrid);
    historyTab.add(historyBar);

    this.tabs = new TabPanel();
    this.tabs.addTab('Pending', this.pendingTab);
    this.tabs.addTab('Activity', this.activityTab);
    this.tabs.addTab('Users', usersTab);
    this.tabs.addTab('History', historyTab);
    this.tabs.element.addEventListener('select', () => { this.load(this.tabName); this.updateButtons(); });
    this.content = this.tabs;

    this.approveUserButton = this.buttonBar.addButton('Approve User', () => this.moderateUser('approved'));
    this.blockUserButton = this.buttonBar.addButton('Block User', () => this.moderateUser('blocked'));
    this.resetUserButton = this.buttonBar.addButton('Check Their Posts', () => this.moderateUser('pending_moderation'));
    this.buttonBar.add(new Spacer());
    this.buttonBar.addButton('Refresh', () => this.load(this.tabName));
    this.updateButtons();
  }

  /** 'pending', 'activity', 'users' or 'history': the tab showing. */
  get tabName() { return ['pending', 'activity', 'users', 'history'][this.tabs.selectedIndex] ?? 'pending'; }

  /** The user selected in the Users tab, or null. */
  get selectedUser() {
    const id = this.usersGrid.selectedRow?.value;
    return this.lists.users.find((u) => u.id === id) ?? null;
  }

  /** Reads a page of a tab's list from the server and shows it. */
  async load(name, page = this.pages[name]) {
    const c = this.client;
    const show = (text) => {
      if (name === 'pending' || name === 'activity') { this[`${name}Tab`].cards.items = []; this[`${name}Tab`].cards.emptyText = text; }
      if (name === 'users') { this.usersGrid.rows = []; this.usersGrid.emptyText = text; }
      if (name === 'history') { this.historyGrid.rows = []; this.historyGrid.emptyText = text; }
    };
    let answer;
    try {
      answer = name === 'pending' ? await c.pending({ page })
        : name === 'activity' ? await c.activity({ page })
          : name === 'users' ? await c.users({ q: this.userSearch.text.trim(), page })
            : await c.history({ page });
    } catch (e) {
      show(`Cannot read: ${e.message}`);
      return;
    }
    this.pages[name] = answer.page ?? 1;
    if (name === 'pending' || name === 'activity') {
      const tab = this[`${name}Tab`];
      this.lists[name] = answer.posts ?? [];
      tab.cards.items = this.lists[name].map(moderationCard);
      tab.cards.scrollToTop();
      tab.pager.set(answer.page, answer.total_pages);
      if (name === 'pending') {
        tab.count.text = this.lists[name].length ? `${this.lists[name].length} post(s) on this page wait for approval` : '';
        this.tabs.strip.children[0].textContent = this.lists[name].length ? `Pending (${this.lists[name].length})` : 'Pending';
      }
    } else if (name === 'users') {
      this.lists.users = answer.users ?? [];
      this.usersGrid.rows = this.lists.users.map(userRow);
      this.usersGrid.emptyText = 'No users found';
      this.usersPager.set(answer.page, answer.total_pages);
    } else {
      this.lists.history = answer.records ?? [];
      this.historyGrid.rows = this.lists.history.map(historyRow);
      this.historyGrid.emptyText = 'No decisions yet';
      this.historyPager.set(answer.page, answer.total_pages);
    }
    this.updateButtons();
  }

  /** Approves or blocks a post from the Pending or Activity tab. */
  async moderatePost(tabName, id, action) {
    if (action !== 'approve' && action !== 'block') return;
    const post = this.lists[tabName].find((p) => p.id === id);
    const tab = this[`${tabName}Tab`];
    tab.cards.busy = true;
    try {
      await this.client.moderatePost(id, action === 'approve' ? 'approved' : 'blocked');
      this._toast(`${action === 'approve' ? 'Approved' : 'Blocked'} ${post?.user?.name ?? 'the'}'s post`, 'success');
      await this.load(tabName);
      this.onChange?.();
    } catch (e) {
      this._toast(e.message, 'error');
    } finally {
      tab.cards.busy = false;
    }
  }

  /** Sets the standing of the user selected in the Users tab. */
  async moderateUser(state) {
    const user = this.selectedUser;
    if (!user) return;
    try {
      await this.client.moderateUser(user.id, state);
      this._toast(`${user.name}: ${MODERATION_LABELS[state]}`, 'success');
      await this.load('users');
      this.onChange?.();
    } catch (e) {
      this._toast(e.message, 'error');
    }
  }

  _toast(message, kind) {
    if (this.parent) Toast.show(this.parent, { message, kind });
  }

  updateButtons() {
    const onUsers = this.tabName === 'users';
    const user = onUsers ? this.selectedUser : null;
    for (const b of [this.approveUserButton, this.blockUserButton, this.resetUserButton]) b.visible = onUsers;
    this.approveUserButton.enabled = Boolean(user) && user.moderation_state !== 'approved';
    this.blockUserButton.enabled = Boolean(user) && user.moderation_state !== 'blocked';
    this.resetUserButton.enabled = Boolean(user) && user.moderation_state !== 'pending_moderation';
    this.buttonBar.layout();
  }

  open(viewport) {
    super.open(viewport);
    this.load(this.tabName);
    return this;
  }
}
