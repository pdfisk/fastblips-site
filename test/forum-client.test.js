import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setToken } from '../src/ui/db-client.js';
import {
  ForumClient, boardItems, allBoards, topicRow, postCard, topicSummary, postingProblem, relativeTime,
} from '../src/ui/forum-client.js';

// A fake fetch that records requests and answers from a list of responses.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers?.Authorization, body: init.body ? JSON.parse(init.body) : undefined });
    const r = responses.shift() ?? { status: 200, body: {} };
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
  };
  fn.calls = calls;
  return fn;
}

const BASE = 'http://db.test';
const client = (fetch) => new ForumClient({ baseUrl: BASE, fetch });

test('reading asks the forum API without a token when signed out', async () => {
  setToken('', BASE);
  const fetch = fakeFetch({ status: 200, body: { user: null, groups: [] } }, { status: 200, body: { topics: [] } },
    { status: 200, body: { topics: [] } }, { status: 200, body: { topic: {}, posts: [] } });
  const c = client(fetch);
  assert.deepEqual(await c.overview(), { user: null, groups: [] });
  await c.topics('getting-started', { page: 2 });
  await c.search('draw a circle');
  await c.topic('my-topic', { page: 'last' });
  assert.deepEqual(fetch.calls.map((x) => [x.method, x.url, x.auth]), [
    ['GET', 'http://db.test/forum', undefined],
    ['GET', 'http://db.test/forum/boards/getting-started/topics?page=2', undefined],
    ['GET', 'http://db.test/forum/topics?q=draw%20a%20circle', undefined],
    ['GET', 'http://db.test/forum/topics/my-topic?page=last', undefined],
  ]);
});

test('posting sends the token and the body the server expects', async () => {
  setToken('tok', BASE);
  try {
    const fetch = fakeFetch(
      { status: 201, body: { topic: { slug: 't' }, post: { id: 1 } } },
      { status: 201, body: { post: { id: 2 } } },
      { status: 200, body: { post: { id: 2 } } },
      { status: 204 },
      { status: 200, body: { following: true } },
      { status: 200, body: { html: '<p>x</p>' } },
      { status: 200, body: { post: {} } },
      { status: 200, body: { user: {} } },
    );
    const c = client(fetch);
    await c.createTopic('python', { title: 'Hi', content: 'Hello', sticky: true });
    await c.reply('t', 'A reply');
    await c.editPost(2, 'Edited');
    await c.deletePost(2);
    assert.equal(await c.follow('t'), true);
    assert.equal(await c.preview('x'), '<p>x</p>');
    await c.moderatePost(5, 'approved');
    await c.moderateUser(9, 'blocked');
    assert.deepEqual(fetch.calls.map((x) => [x.method, x.url.replace(BASE, ''), x.body]), [
      ['POST', '/forum/boards/python/topics', { topic: { title: 'Hi', content: 'Hello', sticky: true } }],
      ['POST', '/forum/topics/t/posts', { post: { content: 'A reply' } }],
      ['PATCH', '/forum/posts/2', { post: { content: 'Edited' } }],
      ['DELETE', '/forum/posts/2', undefined],
      ['POST', '/forum/topics/t/follow', undefined],
      ['POST', '/forum/preview', { content: 'x' }],
      ['POST', '/forum/moderation/posts/5', { moderation_state: 'approved' }],
      ['PATCH', '/forum/moderation/users/9', { moderation_state: 'blocked' }],
    ]);
    assert.ok(fetch.calls.every((x) => x.auth === 'Bearer tok'));
  } finally {
    setToken('', BASE);
  }
});

test('a refusal from the server is an error with its message', async () => {
  setToken('tok', BASE);
  try {
    const c = client(fakeFetch({ status: 403, body: { error: 'this topic is locked' } }));
    await assert.rejects(c.reply('t', 'x'), { message: 'this topic is locked', status: 403 });
    const d = client(fakeFetch({ status: 422, body: { errors: { title: ["can't be blank"] } } }));
    await assert.rejects(d.createTopic('b', { title: '', content: 'x' }), { message: "title can't be blank" });
  } finally {
    setToken('', BASE);
  }
});

const groups = [
  { name: 'FastBlips', boards: [{ slug: 'announcements', name: 'Announcements', locked: true, topics_count: 3, can_post: false }] },
  { name: 'Learning', boards: [{ slug: 'python', name: 'BlipPy (Python)', topics_count: 12, unread_topics_count: 2, can_post: true }] },
];

test('boardItems: a heading per group, then its boards; unread counts as badges', () => {
  const items = boardItems(groups, { unreadItem: true });
  assert.deepEqual(items.map((i) => [i.header ? 'H' : i.value, i.label, i.detail ?? null, Boolean(i.badge)]), [
    [':unread', 'Unread topics', null, false],
    ['H', 'FastBlips', null, false],
    ['announcements', 'Announcements', '3', false],
    ['H', 'Learning', null, false],
    ['python', 'BlipPy (Python)', '2', true],
  ]);
  assert.deepEqual(allBoards(groups).map((b) => b.slug), ['announcements', 'python']);
});

test('topicRow: marks, replies, the last post, and bold when unread', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  const row = topicRow({ slug: 's', title: 'Circles', user: 'ann', last_user: 'bob', posts_count: 3, sticky: true,
    locked: false, unread: true, last_post_at: '2026-11-09T11:55:00Z', board: { name: 'Python' } }, { now, showBoard: true });
  assert.equal(row.value, 's');
  assert.deepEqual(row.cells, ['\u{1F4CC} Circles  — Python', 'ann', '2', '5 min ago by bob']);
  assert.equal(row.emphasis, true);
});

test('postCard: badges and the actions this user may take', () => {
  const card = postCard({ id: 4, user: { name: 'ann' }, html: '<p>Hi</p>', moderation_state: 'pending_moderation',
    created_at: '2026-11-09T10:00:00Z', updated_at: '2026-11-09T10:30:00Z', can_edit: true, can_delete: false,
    can_moderate: true }, { canReply: true, now: new Date('2026-11-09T12:00:00Z') });
  assert.deepEqual(card.badges.map((b) => b.label), ['Awaiting approval', 'edited']);
  assert.deepEqual(card.actions.map((a) => a.name), ['quote', 'edit', 'approve', 'block']);
  assert.equal(card.meta, '2 h ago');
});

test('relativeTime, topicSummary and postingProblem', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  assert.equal(relativeTime('2026-11-09T11:59:30Z', now), 'just now');
  assert.equal(relativeTime('2026-11-08T10:00:00Z', now), 'yesterday');
  assert.equal(relativeTime('2025-03-04T10:00:00Z', now), 'Mar 4, 2025');
  assert.equal(topicSummary({ board: { name: 'Python' }, user: 'ann', posts_count: 2, locked: true }),
    'Python · started by ann · 1 reply · locked');
  assert.match(postingProblem({ user: null }), /Sign in/);
  assert.equal(postingProblem({ user: { name: 'a' }, topic: { can_reply: false, locked: true } }), 'This topic is locked');
  assert.equal(postingProblem({ user: { name: 'a' }, board: groups[0].boards[0] }), 'Only moderators post in Announcements');
  assert.equal(postingProblem({ user: { name: 'a' }, topic: { can_reply: true } }), '');
});
