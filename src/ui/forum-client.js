// ForumClient: the forum's JSON API on the database server (rails/
// ForumApiController and ForumModerationController), for the Forum window.
// Every forum operation the IDE offers goes through here: the boards, a
// board's topics, a topic's posts, posting, editing, deleting, following,
// searching, previews and moderation.
//
// Reading needs no sign-in; anything that changes the forum sends the sign-in
// token (File > Sign In), as SourceStore does. Errors are StoreErrors with a
// readable message. No DOM is needed, so it runs (and is tested) under Node.
//
// Also here: the small pure helpers the windows use to show what the server
// answers (boardItems, topicRow, postCard, ...), so they can be tested too.

import { SourceStore, getServerUrl } from './db-client.js';

const enc = encodeURIComponent;

function query(params) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${enc(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export class ForumClient {
  /** @param {{baseUrl?: string|(() => string), fetch?: typeof fetch}} [options] */
  constructor({ baseUrl = getServerUrl, fetch: fetchFn } = {}) {
    this._store = new SourceStore({ resource: 'forum', key: 'forum', baseUrl, fetch: fetchFn });
  }

  _get(path) { return this._store._request('GET', path); }
  _send(method, path, body) { return this._store._request(method, path, body); }

  // ---- reading ---------------------------------------------------------------

  /** { user: {name, admin, moderator, moderation_state} | null, groups: [{name, boards}] } */
  overview() { return this._get(''); }

  /** A board's topics: { board, topics, page, total_pages }. */
  topics(board, { page } = {}) { return this._get(`/boards/${enc(board)}/topics${query({ page })}`); }

  /** Topics in every board matching q: { topics, page, total_pages }. */
  search(q, { page } = {}) { return this._get(`/topics${query({ q, page })}`); }

  /** Topics with posts this user has not read: { topics, page, total_pages }. */
  unread({ page } = {}) { return this._get(`/topics${query({ filter: 'unread', page })}`); }

  /** A topic and a page of its posts (page may be 'last'): { topic, posts, page, total_pages }. */
  topic(id, { page } = {}) { return this._get(`/topics/${enc(id)}${query({ page })}`); }

  /** The text that quotes a post in a reply. */
  async quote(postId) { return (await this._get(`/posts/${enc(postId)}/quote`)).content; }

  /** What a post will look like: sanitized HTML. */
  async preview(content) { return (await this._send('POST', '/preview', { content })).html; }

  // ---- posting -----------------------------------------------------------------

  /** Starts a topic: { topic, post }. sticky and locked are for moderators. */
  createTopic(board, { title, content, sticky, locked }) {
    return this._send('POST', `/boards/${enc(board)}/topics`, { topic: { title, content, sticky, locked } });
  }

  /** Changes a topic's title, or (moderators) locks, pins or moves it: { topic }. */
  updateTopic(id, fields) { return this._send('PATCH', `/topics/${enc(id)}`, { topic: fields }); }

  /** Deletes a topic and its posts (administrators). */
  async deleteTopic(id) { await this._send('DELETE', `/topics/${enc(id)}`); }

  /** Follows a topic (true) or stops (false); resolves to the new state. */
  async follow(id, on = true) {
    return (await this._send(on ? 'POST' : 'DELETE', `/topics/${enc(id)}/follow`)).following;
  }

  /** Replies in a topic: { post, topic }. */
  reply(topicId, content) { return this._send('POST', `/topics/${enc(topicId)}/posts`, { post: { content } }); }

  /** Changes a post's text: { post }. */
  editPost(id, content) { return this._send('PATCH', `/posts/${enc(id)}`, { post: { content } }); }

  /** Deletes a reply (not a topic's first post). */
  async deletePost(id) { await this._send('DELETE', `/posts/${enc(id)}`); }

  // ---- moderation ----------------------------------------------------------------

  /** Posts waiting for approval, oldest first: { posts, page, total_pages }. */
  pending({ page } = {}) { return this._get(`/moderation/pending${query({ page })}`); }

  /** Every post, newest first: { posts, page, total_pages }. */
  activity({ page } = {}) { return this._get(`/moderation/activity${query({ page })}`); }

  /** What moderators decided: { records, page, total_pages }. */
  history({ page } = {}) { return this._get(`/moderation/history${query({ page })}`); }

  /** Approves ('approved') or blocks ('blocked') a post: { post }. */
  moderatePost(id, state) { return this._send('POST', `/moderation/posts/${enc(id)}`, { moderation_state: state }); }

  /** Users, pending first: { users, page, total_pages }. */
  users({ q, page } = {}) { return this._get(`/moderation/users${query({ q, page })}`); }

  /** Sets a user's standing: 'approved', 'blocked' or 'pending_moderation'. */
  moderateUser(id, state) { return this._send('PATCH', `/moderation/users/${enc(id)}`, { moderation_state: state }); }
}

// ---- showing what the server answers -------------------------------------------

/** Words for a moderation state. */
export const MODERATION_LABELS = {
  pending_moderation: 'Awaiting approval',
  approved: 'Approved',
  blocked: 'Blocked',
};

/**
 * A short time: "just now", "5 min ago", "3 h ago", "yesterday", else a date
 * ("Mar 4", or "Mar 4, 2025" in another year). now is for tests.
 */
export function relativeTime(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const s = Math.round((now - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return 'yesterday';
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

/** The board list's items: a heading per group, then its boards. */
export function boardItems(groups, { unreadItem = false } = {}) {
  const items = [];
  if (unreadItem) items.push({ value: ':unread', label: 'Unread topics', icon: '★' });
  for (const group of groups ?? []) {
    items.push({ header: true, label: group.name });
    for (const b of group.boards ?? []) {
      items.push({
        value: b.slug,
        label: b.name,
        icon: b.locked ? '\u{1F512}' : '#',
        detail: b.unread_topics_count ? String(b.unread_topics_count) : String(b.topics_count ?? ''),
        badge: Boolean(b.unread_topics_count),
        title: b.description || b.name,
      });
    }
  }
  return items;
}

/** Every board in the overview, in order. */
export function allBoards(groups) {
  return (groups ?? []).flatMap((g) => g.boards ?? []);
}

/** A row of the topics grid: Topic, Started by, Replies, Last post. */
export function topicRow(t, { showBoard = false, now } = {}) {
  const marks = [t.sticky ? '\u{1F4CC}' : '', t.locked ? '\u{1F512}' : '',
    t.moderation_state === 'pending_moderation' ? '⏳' : ''].filter(Boolean).join('');
  const title = `${marks ? `${marks} ` : ''}${t.title}${showBoard && t.board ? `  — ${t.board.name}` : ''}`;
  const replies = Math.max(0, (t.posts_count ?? 1) - 1);
  return {
    value: t.slug,
    cells: [title, t.user ?? '', String(replies), `${relativeTime(t.last_post_at, now)}${t.last_user ? ` by ${t.last_user}` : ''}`],
    sort: [t.title.toLowerCase(), t.user ?? '', replies, t.last_post_at ?? ''],
    emphasis: t.unread === true,
  };
}

/**
 * A post as a card for the posts list: the author and when, badges for its
 * state, its HTML, and the actions this user may take on it. canReply is
 * whether the topic takes replies.
 */
export function postCard(post, { canReply = false, now } = {}) {
  const edited = post.updated_at && post.created_at
    && new Date(post.updated_at) - new Date(post.created_at) > 60_000;
  const badges = [];
  if (post.moderation_state && post.moderation_state !== 'approved') {
    badges.push({ label: MODERATION_LABELS[post.moderation_state] ?? post.moderation_state,
      tone: post.moderation_state === 'blocked' ? 'danger' : 'warning' });
  }
  if (edited) badges.push({ label: 'edited' });
  const actions = [];
  if (canReply) actions.push({ name: 'quote', label: 'Quote' });
  if (post.can_edit) actions.push({ name: 'edit', label: 'Edit' });
  if (post.can_delete) actions.push({ name: 'delete', label: 'Delete', tone: 'danger' });
  if (post.can_moderate && post.moderation_state !== 'approved') actions.push({ name: 'approve', label: 'Approve' });
  if (post.can_moderate && post.moderation_state !== 'blocked') actions.push({ name: 'block', label: 'Block', tone: 'danger' });
  return {
    value: post.id,
    author: post.user?.name ?? '',
    avatar: post.user?.avatar_url ?? '',
    meta: relativeTime(post.created_at, now),
    metaTitle: post.created_at ? new Date(post.created_at).toLocaleString() : '',
    badges,
    html: post.html ?? '',
    actions,
  };
}

/** The line over a topic's posts: board, author, replies and the topic's state. */
export function topicSummary(topic) {
  if (!topic) return '';
  const replies = Math.max(0, (topic.posts_count ?? 1) - 1);
  const parts = [topic.board?.name, `started by ${topic.user}`, `${replies} repl${replies === 1 ? 'y' : 'ies'}`];
  if (topic.sticky) parts.push('pinned');
  if (topic.locked) parts.push('locked');
  if (topic.following) parts.push('following');
  return parts.filter(Boolean).join(' · ');
}

/** Why a user cannot post here, or '' if they can. */
export function postingProblem({ user, board, topic } = {}) {
  if (!user) return 'Sign in (File > Sign In) to post in the forum';
  if (user.moderation_state === 'blocked') return 'Your account cannot post in the forum';
  if (topic && !topic.can_reply) return topic.locked ? 'This topic is locked' : 'You cannot reply here';
  if (board && !board.can_post) return board.locked ? `Only moderators post in ${board.name}` : `You cannot post in ${board.name}`;
  return '';
}
