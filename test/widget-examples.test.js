// The widget examples (examples/*.py), run on the real widget host over a
// fake DOM (example-host.js) and used as a person would use them: click,
// type, pick, and then look at what the widgets say. Together they check that
// every example does what its comments say, that every call it makes is a
// real one, and that every widget class is shown in at least one example.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { WIDGET_CLASSES } from '../src/vm/runtime/widgets.js';
import { runExample } from './example-host.js';

const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
const examples = readdirSync(new URL('../examples/', import.meta.url)).filter((f) => f.endsWith('.py')).sort();
const at = (w) => [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height];

// ---- the examples as a set ------------------------------------------------------------

test('every widget class is made in at least one example', () => {
  const sources = examples.map(read);
  const missing = WIDGET_CLASSES.map((c) => c.name).filter((name) => {
    const made = new RegExp(`\\b${name}\\(`);
    return !sources.some((s) => made.test(s));
  });
  assert.deepEqual(missing, [], 'a widget class has no example: add one to examples/ and to its README');
});

test('every example is described in examples/README.md', () => {
  const index = readFileSync(new URL('../examples/README.md', import.meta.url), 'utf8');
  assert.deepEqual(examples.filter((f) => !index.includes(f)), []);
});

test('every class the README says an example shows is made in that example', () => {
  const index = readFileSync(new URL('../examples/README.md', import.meta.url), 'utf8');
  const rows = index.split('\n').filter((line) => /^\| `[a-z0-9-]+\.py`/.test(line));
  assert.ok(rows.length >= examples.length - 1);
  for (const row of rows) {
    const [, file, , classes] = row.split('|').map((x) => x.trim());
    const name = file.replaceAll('`', '');
    assert.ok(examples.includes(name), `${name} is listed but is not there`);
    for (const cls of classes.split(',').map((x) => x.trim()).filter(Boolean)) {
      assert.match(read(name), new RegExp(`\\b${cls}\\(`), `${name} does not make a ${cls}`);
    }
  }
});

// ---- buttons and menus ------------------------------------------------------------------

test('buttons-and-menus.py: buttons, a split button, menus, a button bar and a window', async () => {
  const app = await runExample('buttons-and-menus.py');
  const status = () => app.byId('status').text;
  assert.equal(status(), 'Click something');

  app.click(app.byId('hello'));
  app.click(app.byId('hello'));
  assert.equal(status(), 'Hello pressed 2 time(s)');
  app.click(app.byId('toggle'));
  assert.deepEqual([app.byId('hello').enabled, app.byId('toggle').label], [false, 'Enable Hello']);
  app.click(app.byId('toggle'));
  assert.deepEqual([app.byId('hello').enabled, app.byId('toggle').label], [true, 'Disable Hello']);

  app.click(app.byId('save'));                       // the button part
  assert.equal(status(), 'Saved');
  app.choose(app.byId('save'), 0);                   // under the arrow
  assert.equal(status(), 'Chose Save As...');
  assert.equal(app.byId('save').items.length, 3);   // two items and a separator
  app.choose(app.byId('file'), 3);
  assert.equal(status(), 'Chose Quit');

  app.click(app.byId('remember'));
  app.click(app.byId('remember'));
  assert.deepEqual([status(), app.byId('recent').items.length], ['2 recent item(s)', 2]);
  app.choose(app.byId('recent'), 1);
  assert.equal(status(), 'Chose Document 2');
  app.click(app.byId('forget'));
  assert.deepEqual([status(), app.byId('recent').items.length], ['Recent list cleared', 0]);

  app.click(app.byId('bar-centre'));
  assert.equal(status(), 'Pressed Centre');

  const ask = app.byId('ask');
  assert.equal(ask.parent, null, 'the question starts closed');
  app.click(app.byId('question'));
  assert.equal(ask.parent, app.layer);
  app.click(app.byId('yes'));
  assert.deepEqual([status(), ask.parent], ['Delete chosen', null]);
});

// ---- form fields ---------------------------------------------------------------------------

test('form-fields.py: the button stays off until the form is valid', async () => {
  const app = await runExample('form-fields.py', { width: 460, height: 560 });
  const status = () => app.byId('status').text;
  const create = app.byId('create');
  assert.deepEqual([status(), create.enabled], ['Fill in the form', false]);
  assert.equal(app.byId('name').maxLength, 20);
  assert.equal(app.byId('password').element.type, 'password');
  assert.equal(app.byId('country').selectedText, 'Canada');

  app.type(app.byId('name'), 'Ann');
  assert.equal(status(), 'That email needs an @');
  app.type(app.byId('email'), 'ann@example.com');
  assert.equal(status(), 'The password needs at least 6 characters');
  app.type(app.byId('password'), 'secret1');
  assert.equal(status(), 'The two passwords differ');
  app.type(app.byId('again'), 'secret1');
  assert.deepEqual([status(), create.enabled], ['Ready', true]);
  app.type(app.byId('again'), 'secret2');
  assert.equal(create.enabled, false);
  app.type(app.byId('again'), 'secret1');

  app.click(create);
  assert.equal(status(), 'Welcome, Ann! Plan: Free. News: weekly.');
  // choosing Pro unchecks Free: the two are one group
  app.byId('pro').checked = true;
  assert.deepEqual([app.byId('free').checked, app.byId('pro').checked], [false, true]);
  app.pick(app.byId('how'), 1);
  app.click(create);
  assert.equal(status(), 'Welcome, Ann! Plan: Pro. News: monthly.');
  // unchecked, the newsletter's contents cannot be used and the summary leaves them out
  app.byId('news').checked = false;
  assert.equal(app.byId('how').element.inert, true);
  app.click(create);
  assert.equal(status(), 'Welcome, Ann! Plan: Pro.');
  app.byId('news').checked = true;
  assert.equal(app.byId('how').element.inert, false);

  app.submit(app.byId('again'));                    // Enter in the last field
  assert.equal(status(), 'Welcome, Ann! Plan: Pro. News: monthly.');

  // a password is never saved with the screen
  const json = app.host.call(app.host._idOf(app.layer), 'toJson', []);
  assert.ok(!json.includes('secret1') && !json.includes('secret2'), 'the password is in the saved screen');
  assert.ok(json.includes('ann@example.com'), 'but the email is');

  app.click(app.byId('clear'));
  assert.deepEqual([app.byId('name').text, app.byId('password').text, status(), create.enabled, app.byId('free').checked], ['', '', 'Enter your name', false, true]);
});

// ---- panels ---------------------------------------------------------------------------------

test('panels-and-rows.py: free placement, shares of a row, and moving a widget between containers', async () => {
  const app = await runExample('panels-and-rows.py', { width: 520, height: 500 });
  const status = () => app.byId('status').text;
  const dot = (i) => app.byId(`dot-${i}`);
  assert.deepEqual([at(dot(0)), at(dot(1)), at(dot(2))].map((b) => b.slice(0, 2)), [[10, 10], [110, 40], [210, 70]]);
  app.click(app.byId('shuffle'));
  assert.deepEqual([dot(0).bounds.x, dot(0).bounds.y], [110, 40]);
  assert.equal(status(), 'A is at 110, 40');

  // the flex children of the row share what is left 1 : 2 : 1
  const narrow = app.byId('narrow').bounds.width;
  const wide = app.byId('wide').bounds.width;
  assert.ok(Math.abs(wide - 2 * narrow) <= 2, `${wide} is not twice ${narrow}`);
  assert.ok(Math.abs(app.byId('last').bounds.width - narrow) <= 1);
  app.click(app.byId('measure'));
  assert.match(status(), new RegExp(`^row: ${narrow} / ${wide} / ${narrow}   middle height: \\d+$`));

  // hiding the wide one gives its room to the others
  app.click(app.byId('hide'));
  assert.equal(app.byId('wide').visible, false);
  assert.ok(app.byId('narrow').bounds.width > narrow);
  app.click(app.byId('hide'));
  assert.equal(app.byId('narrow').bounds.width, narrow);

  app.click(app.byId('move'));
  assert.deepEqual([app.byId('mover').parent === app.byId('column'), status()], [true, 'The chip is in the column']);
  app.click(app.byId('move'));
  assert.equal(app.byId('mover').parent, app.byId('row'));
});

test('splits-and-tabs.py: a list and its tabs show one choice, and dividers say where they went', async () => {
  const app = await runExample('splits-and-tabs.py', { width: 520, height: 400 });
  const status = () => app.byId('status').text;
  assert.deepEqual([app.byId('tabs').selectedIndex, app.byId('topics').selectedIndex], [0, 0]);
  app.pick(app.byId('topics'), 2);
  assert.deepEqual([app.byId('tabs').selectedLabel, status()], ['Log', 'Tab: Log']);
  app.click(app.byId('next'));                     // Log -> Overview, and the list follows
  assert.deepEqual([app.byId('tabs').selectedIndex, app.byId('topics').selectedIndex, status()], [0, 0, 'Tab: Overview']);

  assert.equal(app.byId('outer').position, 0.3);
  app.click(app.byId('wider'));
  assert.equal(app.byId('outer').position, 0.4);
  app.click(app.byId('reset'));
  assert.deepEqual([app.byId('outer').position, app.byId('inner').position], [0.3, 0.35]);
  assert.deepEqual(app.byId('log').items.map((i) => i.label),
    ['outer divider at 40%', 'outer divider at 30%', 'inner divider at 35%']);
});

// ---- windows -----------------------------------------------------------------------------------

test('windows.py: windows open and close, hear about it, and the palette paints the screen', async () => {
  const app = await runExample('windows.py', { width: 520, height: 400 });
  const status = () => app.byId('status').text;
  const notes = app.byId('notes');
  const palette = app.byId('palette');
  assert.deepEqual([notes.parent, palette.parent], [app.layer, app.layer], 'a new window is open');
  app.click(app.byId('close-all'));
  assert.deepEqual([notes.parent, palette.parent, status()], [null, null, 'Palette closed']);
  app.click(app.byId('open-notes'));
  assert.deepEqual([notes.parent, status()], [app.layer, 'Notes opened']);

  app.click(app.byId('open-palette'));
  app.click(app.byId('swatch-mint'));
  assert.equal(status(), 'The screen is Mint');
  assert.equal(app.layer.element.style.background, '#d9ead3');

  app.click(app.byId('maximize'));
  assert.deepEqual([notes.maximized, status(), app.byId('maximize').label], [true, 'Notes maximized', 'Restore notes']);
  app.click(app.byId('maximize'));
  assert.deepEqual([notes.maximized, status()], [false, 'Notes restored']);

  app.typePanel(app.byId('notes-text'), 'something');
  app.click(app.byId('clear-notes'));
  assert.deepEqual([app.byId('notes-text').text, status()], ['', 'Notes cleared']);
  app.click(app.byId('close-notes'));               // closed from its own button bar: on_close hears it
  assert.deepEqual([notes.parent, status()], [null, 'Notes closed']);
  assert.equal(app.byId('history').items.at(-1).label, 'Notes closed');
});

// ---- lists and editors -----------------------------------------------------------------------

test('lists-and-editors.py: a task list that can be added to, renamed, trimmed and cleared', async () => {
  const app = await runExample('lists-and-editors.py', { width: 600, height: 400 });
  const status = () => app.byId('status').text;
  const tasks = () => app.byId('tasks').items.map((i) => i.label);
  app.click(app.byId('add'));
  assert.equal(status(), 'Type a task first');
  app.type(app.byId('entry'), 'Buy milk');
  app.click(app.byId('add'));
  app.type(app.byId('entry'), 'Call Ann');
  app.submit(app.byId('entry'));                    // Enter adds too
  assert.deepEqual([tasks(), app.byId('count').text, app.byId('tasks').selectedIndex], [['Buy milk', 'Call Ann'], '2 tasks', -1]);
  assert.equal(app.byId('entry').text, '');

  app.pick(app.byId('tasks'), 0);                   // picking a task puts it in the field
  assert.equal(app.byId('entry').text, 'Buy milk');
  app.type(app.byId('entry'), 'Buy oat milk');
  app.click(app.byId('rename'));
  assert.deepEqual([tasks(), status()], [['Buy oat milk', 'Call Ann'], 'Renamed to Buy oat milk']);
  assert.equal(app.byId('tasks').selectedIndex, 0, 'the same row stays selected');

  app.click(app.byId('remove'));
  assert.deepEqual([tasks(), app.byId('tasks').selectedIndex, app.byId('entry').text, app.byId('count').text],
    [['Call Ann'], 0, 'Call Ann', '1 task']);
  app.click(app.byId('clear'));
  assert.deepEqual([tasks(), app.byId('count').text, status()], [[], '0 tasks', 'Cleared']);
  app.click(app.byId('remove'));
  assert.equal(status(), 'Pick a task to remove');

  app.typePanel(app.byId('notes'), 'one two three');
  assert.equal(app.byId('notes-count').text, '13 characters, 3 words');
  assert.equal(app.byId('code-lines').text, '2 line(s)');
  app.typePanel(app.byId('code'), 'a\nb\nc');
  assert.equal(app.byId('code-lines').text, '3 line(s)');
  app.click(app.byId('lock'));
  assert.deepEqual([app.byId('code').readOnly, app.byId('lock').label], [true, 'Unlock code']);
  assert.equal(app.byId('code').textArea.readOnly, true);
});

// ---- shapes and images ------------------------------------------------------------------------

test('shapes-and-images.py: shapes that change when clicked, and pictures that load, fail and fit', async () => {
  const app = await runExample('shapes-and-images.py', { width: 520, height: 420 });
  const status = () => app.byId('status').text;
  const picture = app.byId('picture');
  assert.ok(picture.source.startsWith('data:image/svg+xml;base64,'));
  assert.deepEqual([picture.status, picture.alt, picture.fit], ['loading', 'A sunrise', 'contain']);

  app.click(app.byId('circle'));
  assert.deepEqual([app.byId('circle').background, status()], ['#f4cccc', 'The circle is filled #f4cccc']);
  app.click(app.byId('card'));
  assert.deepEqual([app.byId('card').radius, status()], [32, 'Corner radius 32']);
  app.click(app.byId('card'));
  app.click(app.byId('card'));
  app.click(app.byId('card'));
  assert.equal(app.byId('card').radius, 16, 'it goes round: 16, 32, 48, 0, 16');
  app.click(app.byId('oval'));
  assert.deepEqual([app.byId('oval').borderWidth[0], status()], [8, 'Outline 8 pixels']);

  app.pick(app.byId('fit'), 1);
  assert.deepEqual([picture.fit, status()], ['cover', 'Fit: cover']);
  app.click(app.byId('swap'));
  assert.deepEqual([picture.alt, status()], ['A forest', 'Forest']);

  // the browser says the picture has loaded: on_load reads its own size
  picture.element.naturalWidth = 300;
  picture.element.naturalHeight = 180;
  picture.element.dispatchEvent(new Event('load'));
  app.settle();
  assert.equal(status(), 'Loaded: 300 x 180 pixels');
  // and that the other has not
  app.byId('missing').element.dispatchEvent(new Event('error'));
  app.settle();
  assert.equal(status(), 'The second picture could not be loaded');
});

// ---- the layouts --------------------------------------------------------------------------------

test('layout-gallery.py: each tab is a Composite with its own layout, doing what its note says', async () => {
  const app = await runExample('layout-gallery.py', { width: 520, height: 400 });
  const tabs = app.byId('tabs');
  const names = ['basic', 'canvas', 'grow', 'hbox', 'vbox', 'dock', 'flow', 'grid'];
  assert.deepEqual(tabs.labels, names);
  assert.match(app.byId('about').text, /^basic: /);
  for (const name of names) assert.equal(app.byId(`tab-${name}`).layoutName, name);
  app.pick(tabs, 5);
  assert.match(app.byId('about').text, /^dock: set_edge/);

  const stage = (name) => app.byId(`tab-${name}`);
  const inner = (name) => ({ w: stage(name).bounds.width - 12, h: stage(name).bounds.height - 12 });   // 6 padding a side

  // basic: each where its box says, offset by the padding
  assert.deepEqual(stage('basic').children.map((c) => [c.bounds.x - 6, c.bounds.y - 6]), [[10, 10], [60, 40], [110, 70]]);
  // canvas: pixels from the edges, and percentages
  const [corner, far, middle] = stage('canvas').children;
  assert.deepEqual([corner.bounds.x, corner.bounds.y, corner.bounds.width], [16, 16, 100]);
  assert.equal(far.bounds.x + far.bounds.width, 6 + inner('canvas').w - 10);
  assert.equal(far.bounds.y + far.bounds.height, 6 + inner('canvas').h - 10);
  assert.equal(middle.bounds.width, inner('canvas').w / 2);
  assert.equal(middle.bounds.x, 6 + inner('canvas').w / 4);
  // grow: one child fills the whole area
  assert.deepEqual(at(stage('grow').children[0]), [6, 6, inner('grow').w, inner('grow').h]);
  // hbox: fixed width, 1 : 2 shares, one aligned in the middle across
  const [fixed, one, two, mid] = stage('hbox').children;
  assert.equal(fixed.bounds.width, 90);
  assert.ok(Math.abs(two.bounds.width - 2 * one.bounds.width) <= 1);
  assert.equal(one.bounds.height, inner('hbox').h);
  assert.equal(mid.bounds.y, 6 + (inner('hbox').h - mid.bounds.height) / 2);
  // vbox: pushed to the bottom, the middle one centred across
  const rows = stage('vbox').children;
  assert.equal(rows[2].bounds.y + rows[2].bounds.height, 6 + inner('vbox').h);
  assert.equal(rows[1].bounds.x, 6 + (inner('vbox').w - 120) / 2);
  // dock: the north and south edges are as wide as the area, the centre is what is left
  const [north, south, west, east, centre] = stage('dock').children;
  assert.equal(north.bounds.width, inner('dock').w);
  assert.equal(south.bounds.width, inner('dock').w);
  assert.equal(west.bounds.height, south.bounds.y - 6 - (north.bounds.y + north.bounds.height + 6), 'the side edges fit between the north and south ones');
  assert.equal(centre.bounds.x, west.bounds.x + west.bounds.width + 6);
  assert.equal(centre.bounds.x + centre.bounds.width + 6, east.bounds.x);
  // flow: twelve chips wrap onto more than one line
  const lines = new Set(stage('flow').children.map((c) => c.bounds.y));
  assert.ok(lines.size >= 2, 'the chips do not wrap');
  // grid: the header and footer span three columns; the body takes the room left
  const [head, side, body, extra, foot] = stage('grid').children;
  assert.equal(head.bounds.width, inner('grid').w);
  assert.equal(foot.bounds.width, inner('grid').w);
  assert.ok(body.bounds.width > side.bounds.width && body.bounds.height > head.bounds.height);
  assert.equal(extra.bounds.x + extra.bounds.width, 6 + inner('grid').w, 'extra is aligned right in the last column');
});

// ---- the viewport -------------------------------------------------------------------------------

test('viewport-and-finding.py: find widgets by id and class, and take a snapshot of the screen and go back to it', async () => {
  const app = await runExample('viewport-and-finding.py', { width: 420, height: 420 });
  const status = () => app.byId('status').text;
  for (let i = 0; i < 3; i += 1) app.click(app.byId('increase'));
  assert.equal(app.byId('counter').text, 'Count: 3');
  app.click(app.byId('restore'));
  assert.equal(status(), 'Take a snapshot first');

  app.click(app.byId('snapshot'));
  assert.match(status(), /^Snapshot of \d+ characters$/);
  app.click(app.byId('increase'));
  app.click(app.byId('increase'));
  assert.equal(app.byId('counter').text, 'Count: 5');
  const before = app.byId('counter');
  app.click(app.byId('restore'));
  assert.equal(app.byId('counter').text, 'Count: 3');
  assert.notEqual(app.byId('counter'), before, 'from_json builds new widgets');
  app.click(app.byId('increase'));              // the handlers are wired again, to the same functions
  assert.equal(app.byId('counter').text, 'Count: 4');

  app.click(app.byId('count'));
  assert.equal(status(), '6 buttons, 5 labels');
  app.click(app.byId('parent'));
  assert.match(status(), /^The counter is in the page, which is on the Viewport: 1 widget\(s\) there$/);
  app.click(app.byId('notes'));
  assert.deepEqual([app.byId('note-1').visible, app.byId('note-2').visible, app.byId('title').visible], [false, false, true]);
  app.click(app.byId('notes'));
  assert.equal(app.byId('note-1').visible, true);
});

// ---- mobile -----------------------------------------------------------------------------------------

const PHONE = { width: 360, height: 640 };

test('mobile-navigation.py: the bar follows the page: mailboxes, messages, a message, and compose', async () => {
  const app = await runExample('mobile-navigation.py', PHONE);
  const bar = app.byId('bar');
  const look = () => [bar.title, bar.backText, bar.actionText, app.byId('stack').selectedIndex];
  assert.deepEqual(look(), ['Mailboxes', '', 'Compose', 0]);

  app.pick(app.byId('boxes'), 0);
  assert.deepEqual(look(), ['Inbox', 'Mailboxes', 'Compose', 1]);
  assert.deepEqual(app.byId('messages').items.map((i) => i.label), ['Welcome', 'Lunch?']);
  assert.equal(app.byId('boxes').selectedIndex, -1, 'the row is let go, so it can be picked again');
  app.pick(app.byId('messages'), 1);
  assert.deepEqual(look(), ['Lunch?', 'Inbox', '', 2]);
  assert.deepEqual([app.byId('subject-label').text, app.byId('body-text').text, app.byId('body-text').readOnly], ['Lunch?', 'Are you free at noon?', true]);

  app.tap(bar, 'back');
  assert.deepEqual(look(), ['Inbox', 'Mailboxes', 'Compose', 1]);
  app.tap(bar, 'back');
  assert.deepEqual(look(), ['Mailboxes', '', 'Compose', 0]);

  app.tap(bar, 'action');                          // Compose
  assert.deepEqual(look(), ['New message', 'Cancel', 'Send', 3]);
  app.tap(bar, 'action');                          // Send, with no subject
  assert.deepEqual([look()[3], app.byId('status').text], [3, 'Add a subject first']);
  app.type(app.byId('subject'), 'Hi');
  app.type(app.byId('body'), 'Hello there');
  app.tap(bar, 'action');
  assert.deepEqual([look(), app.byId('status').text], [['Mailboxes', '', 'Compose', 0], 'Message sent']);
  assert.equal(app.byId('subject').text, '', 'the form is empty for the next one');

  app.pick(app.byId('boxes'), 2);                  // Sent has the message
  assert.deepEqual(app.byId('messages').items.map((i) => i.label), ['Hi']);
  app.tap(bar, 'action');                          // compose from the messages page, then Cancel
  app.tap(bar, 'back');
  assert.deepEqual([look(), app.byId('status').text], [['Sent', 'Mailboxes', 'Compose', 1], 'Cancelled']);
});

test('mobile-carousel.py: a gallery stepped through by swiping, the dots and the buttons', async () => {
  const app = await runExample('mobile-carousel.py', PHONE);
  const gallery = app.byId('gallery');
  const look = () => [app.byId('where').text, gallery.selectedIndex, app.byId('previous').enabled, app.byId('next').enabled];
  assert.deepEqual(look(), ['Sunrise (1 of 3)', 0, false, true]);
  assert.equal(gallery.children.length, 3);
  assert.deepEqual(gallery.children.map((p) => p.bounds.x), [0, 360, 720], 'pages wait side by side');
  app.click(app.byId('next'));
  assert.deepEqual(look(), ['Forest (2 of 3)', 1, true, true]);
  app.click(app.byId('next'));
  assert.deepEqual(look(), ['Ocean (3 of 3)', 2, true, false]);
  app.click(app.byId('previous'));
  assert.deepEqual(look(), ['Forest (2 of 3)', 1, true, true]);

  // a swipe on the carousel: dragged left past a fifth of the width, it turns the page
  const swipe = (from, to, t0, t1) => {
    const event = (type, x, time) => Object.defineProperty(Object.assign(new Event(type), { pointerId: 1, clientX: x, clientY: 50, button: 0 }), 'timeStamp', { value: time });
    gallery.element.dispatchEvent(event('pointerdown', from, t0));
    gallery.element.dispatchEvent(event('pointermove', to, t0 + 50));
    gallery.element.dispatchEvent(event('pointerup', to, t1));
    app.settle();
  };
  swipe(300, 100, 0, 600);
  assert.deepEqual(look(), ['Ocean (3 of 3)', 2, true, false]);
  swipe(100, 300, 1000, 1600);
  assert.equal(gallery.selectedIndex, 1);
  gallery.dotsElement.children[0].dispatchEvent(new Event('click'));   // the first dot
  app.settle();
  assert.deepEqual(look(), ['Sunrise (1 of 3)', 0, false, true]);

  assert.deepEqual([gallery.dots, app.byId('bar').actionText], [true, 'Dots off']);
  app.tap(app.byId('bar'), 'action');
  assert.deepEqual([gallery.dots, app.byId('bar').actionText], [false, 'Dots on']);
  app.tap(app.byId('bar'), 'action');
  assert.equal(gallery.dots, true);
});

test('mobile-drawer.py: a menu that slides in from any side, and four ways to close it', async () => {
  const app = await runExample('mobile-drawer.py', PHONE);
  const drawer = app.byId('drawer');
  const look = () => [drawer.open, drawer.side, drawer.panelSize, app.byId('bar').backText, app.byId('status').text];
  assert.deepEqual(look(), [false, 'left', 240, 'Menu', 'The drawer is closed']);
  assert.deepEqual(at(drawer), [0, 0, 360, 640], 'it covers the whole screen');

  app.tap(app.byId('bar'), 'back');                // the Menu button
  assert.deepEqual(look(), [true, 'left', 240, 'Close', 'The drawer is open']);
  assert.equal(app.byId('item-home').element.inert, false, 'open: its buttons can be used');
  app.click(app.byId('item-profile'));             // choosing an item closes it
  assert.deepEqual([app.byId('page-title').text, app.byId('bar').title, drawer.open], ['Profile', 'Profile', false]);
  assert.equal(app.byId('item-home').element.inert, true, 'closed: they cannot be reached');

  app.tap(app.byId('bar'), 'back');
  app.click(app.byId('close'));                    // its own Close button
  assert.equal(drawer.open, false);
  app.tap(app.byId('bar'), 'back');
  drawer.scrim.dispatchEvent(new Event('click'));  // a tap on the dimmed page
  app.settle();
  assert.equal(drawer.open, false);
  app.tap(app.byId('bar'), 'back');
  drawer.element.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));   // Escape
  app.settle();
  assert.equal(drawer.open, false);

  app.click(app.byId('dismiss'));                  // with dismissing off, the dimmed page is not a way out
  assert.deepEqual([drawer.dismissOnTap, app.byId('dismiss').label], [false, 'Close on tap outside: off']);
  app.tap(app.byId('bar'), 'back');
  drawer.scrim.dispatchEvent(new Event('click'));
  app.settle();
  assert.equal(drawer.open, true);
  app.click(app.byId('close'));

  app.pick(app.byId('side'), 2);                   // top and bottom are shorter panels
  assert.deepEqual([drawer.side, drawer.panelSize], ['top', 180]);
  app.pick(app.byId('side'), 1);
  assert.deepEqual([drawer.side, drawer.panelSize], ['right', 240]);
});

test('mobile-app.py: Pocket Notes: an introduction, notes, settings, and a menu to move between them', async () => {
  const app = await runExample('mobile-app.py', PHONE);
  const bar = app.byId('bar');
  const look = () => [app.byId('pages').selectedIndex, bar.title, bar.actionText, app.byId('menu').open];
  assert.deepEqual(look(), [0, 'Welcome', '', false]);
  assert.equal(app.byId('go').label, 'Next');

  // the introduction: Next steps through it; on the last page the button says what it does
  app.click(app.byId('go'));
  app.click(app.byId('go'));
  assert.deepEqual([app.byId('intro').selectedIndex, app.byId('go').label], [2, 'Get started']);
  app.click(app.byId('go'));
  assert.deepEqual(look(), [1, 'Notes (0)', 'Clear', false]);

  app.type(app.byId('entry'), 'Buy milk');
  app.click(app.byId('add'));
  app.type(app.byId('entry'), 'Call Ann');
  app.submit(app.byId('entry'));
  assert.deepEqual([bar.title, app.byId('notes').items.map((i) => i.label)], ['Notes (2)', ['Buy milk', 'Call Ann']]);

  app.tap(bar, 'back');                            // the menu button
  assert.deepEqual(look(), [1, 'Notes (2)', 'Clear', true]);
  app.click(app.byId('menu-settings'));
  assert.deepEqual(look(), [2, 'Settings', 'Reset', false]);

  app.type(app.byId('name'), 'Ann');
  assert.equal(app.byId('greeting').text, 'Welcome, Ann');
  assert.equal(app.byId('summary').text, 'Look: light');
  app.byId('dark').checked = true;
  app.settle();
  assert.deepEqual([app.byId('summary').text, app.byId('light').checked, app.host.layer.element.style.background], ['Look: dark', false, '#444444']);
  app.byId('reminders').checked = true;
  app.pick(app.byId('often'), 1);
  assert.equal(app.byId('summary').text, 'Look: dark, reminders every day');
  app.tap(bar, 'action');                          // Reset
  assert.deepEqual([app.byId('summary').text, app.byId('name').text, app.byId('reminders').checked, app.byId('light').checked], ['Look: light', '', false, true]);

  app.tap(bar, 'back');
  app.click(app.byId('menu-notes'));
  app.tap(bar, 'action');                          // Clear
  assert.deepEqual([bar.title, app.byId('notes').items.length], ['Notes (0)', 0]);
  app.tap(bar, 'back');
  app.click(app.byId('close'));
  assert.equal(app.byId('menu').open, false);
});
