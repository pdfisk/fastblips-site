// NavigationBar, Carousel and Drawer (src/ui/widgets/navigation-bar.js,
// carousel.js, drawer.js): the toolkit widgets over a small stand-in for the
// DOM, as a program sees them through the widget host, and in the designer.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  newNode, addChild, fieldsFor, setField, getField, isFreeParent, isList,
} from '../src/ui/designer-model.js';
import { generateCode } from '../src/ui/designer-codegen.js';

class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.inert = false;
    this.textContent = '';
    this.scrollWidth = 40;
    const names = new Set();
    this.classList = {
      add: (n) => names.add(n), contains: (n) => names.has(n), remove: (n) => names.delete(n),
      toggle: (n, on) => (on ? names.add(n) : names.delete(n)),
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  contains(other) { return other === this || this.children.some((c) => c.contains(other)); }
  remove() {}
  setAttribute() {}
  setPointerCapture() {}
}

let NavigationBar;
let Carousel;
let Drawer;
let Widget;
let ProgramWidgetHost;
let FreeLayer;
let WidgetError;
let host;

/** A widget of a size, for putting in a page or a panel. */
function box(width, height) {
  class Box extends Widget {}
  const w = new Box();
  w.preferredWidth = () => width;
  w.preferredHeight = () => height;
  return w;
}

const at = (w) => [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height];
const create = (cls, ...args) => host.create(cls, args);
const call = (id, method, ...args) => host.call(id, method, args);

/** A pointer event: the kind, where, when (milliseconds), and which pointer. */
function pointer(type, x, y, time = 0, pointerId = 1) {
  const event = Object.assign(new Event(type), { pointerId, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'timeStamp', { value: time });
  return event;
}

function key(widget, name) {
  widget.element.dispatchEvent(Object.assign(new Event('keydown'), { key: name }));
}

function callback(name, heard) {
  const f = (...values) => heard.push(values.length ? `${name}:${values.join(',')}` : name);
  f.handlerName = name;
  return f;
}

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  ({ Widget } = await import('../src/ui/widgets/widget.js'));
  ({ NavigationBar } = await import('../src/ui/widgets/navigation-bar.js'));
  ({ Carousel } = await import('../src/ui/widgets/carousel.js'));
  ({ Drawer } = await import('../src/ui/widgets/drawer.js'));
  ({ ProgramWidgetHost, FreeLayer } = await import('../src/ui/program-widgets.js'));
  ({ WidgetError } = await import('../src/vm/runtime/widgets.js'));
});

function fresh() {
  const layer = new FreeLayer();
  layer.setBounds(0, 0, 400, 300);
  host = new ProgramWidgetHost(layer);
}

// ---- NavigationBar ----------------------------------------------------------------

test('NavigationBar: a title, and back and action buttons that show only while they have text', () => {
  const bar = new NavigationBar('Inbox');
  assert.equal(bar.title, 'Inbox');
  assert.deepEqual([bar.backText, bar.actionText], ['', '']);
  assert.deepEqual([bar.backButton.style.visibility, bar.actionButton.style.visibility], ['hidden', 'hidden']);
  bar.backText = 'Mail';
  bar.actionText = 'Edit';
  assert.deepEqual([bar.backButton.textContent, bar.actionButton.textContent], ['\u2039 Mail', 'Edit']);
  assert.deepEqual([bar.backButton.style.visibility, bar.actionButton.style.visibility], ['visible', 'visible']);
  assert.equal(bar.backText, 'Mail');
  bar.backText = '';
  assert.deepEqual([bar.backButton.textContent, bar.backButton.style.visibility], ['', 'hidden']);
  assert.equal(bar.preferredHeight(), 44);
  assert.equal(bar.element.children.length, 3);
});

test('NavigationBar: tapping a button fires back or action on the bar', () => {
  const bar = new NavigationBar();
  const heard = [];
  bar.element.addEventListener('back', () => heard.push('back'));
  bar.element.addEventListener('action', () => heard.push('action'));
  bar.backButton.dispatchEvent(new Event('click'));
  bar.actionButton.dispatchEvent(new Event('click'));
  bar.backButton.dispatchEvent(new Event('click'));
  assert.deepEqual(heard, ['back', 'action', 'back']);
});

// ---- Carousel ------------------------------------------------------------------------

function carouselOf(pages, width = 300, height = 200) {
  const carousel = new Carousel();
  carousel.setBounds(0, 0, width, height);
  const kids = Array.from({ length: pages }, () => box(1, 1));
  for (const k of kids) carousel.add(k);
  carousel.layout();
  return { carousel, kids };
}

test('Carousel: pages wait side by side; the first is showing and the others are inert', () => {
  const carousel = new Carousel();
  carousel.setBounds(0, 0, 300, 200);
  const heard = [];
  carousel.element.addEventListener('select', (e) => heard.push(e.detail.index));
  const kids = [box(1, 1), box(1, 1), box(1, 1)];
  for (const k of kids) carousel.add(k);
  assert.deepEqual(heard, [0]);
  assert.equal(carousel.selectedIndex, 0);
  assert.deepEqual(kids.map(at), [[0, 0, 300, 200], [300, 0, 300, 200], [600, 0, 300, 200]]);
  assert.deepEqual(kids.map((k) => k.element.inert), [false, true, true]);

  carousel.select(1);
  assert.deepEqual(kids.map((k) => k.bounds.x), [-300, 0, 300]);
  assert.deepEqual(kids.map((k) => k.element.inert), [true, false, true]);
  carousel.select(1);                           // no change, no event
  carousel.select(7);                           // no such page: nothing
  carousel.select(-1);
  carousel.selectNext();
  carousel.selectNext();                        // the last: it does not wrap
  assert.equal(carousel.selectedIndex, 2);
  carousel.selectPrevious();
  carousel.selectPrevious();
  carousel.selectPrevious();                    // the first: it does not wrap
  assert.equal(carousel.selectedIndex, 0);
  assert.deepEqual(heard, [0, 1, 2, 1, 0]);
  assert.equal(carousel.selectedWidget, kids[0]);
});

test('Carousel: one dot a page, the one showing filled, and a tap on a dot shows that page', () => {
  const carousel = new Carousel();
  carousel.setBounds(0, 0, 300, 200);
  carousel.add(box(1, 1));
  assert.equal(carousel.dotsElement.hidden, true, 'no dots for a single page');
  carousel.add(box(1, 1));
  carousel.add(box(1, 1));
  const dots = () => carousel.dotsElement.children;
  assert.deepEqual([carousel.dotsElement.hidden, dots().length], [false, 3]);
  assert.deepEqual(dots().map((d) => d.className.includes('cr-carousel-dot-on')), [true, false, false]);
  dots()[2].dispatchEvent(new Event('click'));
  assert.equal(carousel.selectedIndex, 2);
  assert.deepEqual(dots().map((d) => d.className.includes('cr-carousel-dot-on')), [false, false, true]);
  carousel.dots = false;
  assert.equal(carousel.dotsElement.hidden, true);
  assert.equal(carousel.dots, false);
});

test('Carousel: removing a page keeps a page showing', () => {
  const { carousel, kids } = carouselOf(3);
  const heard = [];
  carousel.element.addEventListener('select', (e) => heard.push(e.detail.index));
  carousel.select(2);
  carousel.remove(kids[0]);                     // before the page showing: it is the same page at 1
  assert.deepEqual([carousel.selectedIndex, carousel.selectedWidget === kids[2]], [1, true]);
  carousel.remove(kids[2]);                     // the page showing: its neighbour
  assert.deepEqual([carousel.selectedIndex, carousel.selectedWidget === kids[1]], [0, true]);
  assert.equal(kids[2].element.inert, false);
  carousel.remove(kids[1]);                     // the last page
  assert.equal(carousel.selectedIndex, -1);
  assert.deepEqual(heard, [2, 0, -1]);
});

test('Carousel: dragging moves the pages; letting go far enough, or flicking, turns the page', () => {
  const { carousel, kids } = carouselOf(3);
  const el = carousel.element;
  // slow, short: snaps back
  el.dispatchEvent(pointer('pointerdown', 200, 50, 0));
  el.dispatchEvent(pointer('pointermove', 195, 50, 10));          // under the threshold: not a drag yet
  assert.equal(el.classList.contains('cr-dragging'), false);
  el.dispatchEvent(pointer('pointermove', 160, 50, 100));
  assert.equal(el.classList.contains('cr-dragging'), true);
  assert.deepEqual(kids.map((k) => k.bounds.x), [-40, 260, 560]);  // the pages follow the finger
  el.dispatchEvent(pointer('pointerup', 160, 50, 1000));
  assert.equal(carousel.selectedIndex, 0);
  assert.deepEqual(kids.map((k) => k.bounds.x), [0, 300, 600]);
  assert.equal(el.classList.contains('cr-dragging'), false);
  assert.equal(carousel._swallowClick, true, 'the click that ends a drag is not a tap on the page');
  el.dispatchEvent(new Event('click'));
  assert.equal(carousel._swallowClick, false);

  // far: turns to the next page
  el.dispatchEvent(pointer('pointerdown', 250, 50, 2000));
  el.dispatchEvent(pointer('pointermove', 100, 50, 2200));
  el.dispatchEvent(pointer('pointerup', 100, 50, 3000));
  assert.equal(carousel.selectedIndex, 1);
  assert.deepEqual(kids.map((k) => k.bounds.x), [-300, 0, 300]);

  // a short, quick flick turns the page back
  el.dispatchEvent(pointer('pointerdown', 100, 50, 4000));
  el.dispatchEvent(pointer('pointermove', 130, 50, 4010));
  el.dispatchEvent(pointer('pointerup', 130, 50, 4020));
  assert.equal(carousel.selectedIndex, 0);
});

test('Carousel: the ends resist, a mostly vertical move is not a drag, and another pointer is ignored', () => {
  const { carousel, kids } = carouselOf(2);
  const el = carousel.element;
  el.dispatchEvent(pointer('pointerdown', 100, 50, 0));
  el.dispatchEvent(pointer('pointermove', 190, 50, 50));          // dragging right at the first page
  assert.equal(kids[0].bounds.x, 30);                             // a third of the way
  el.dispatchEvent(pointer('pointerup', 190, 50, 2000));
  assert.equal(carousel.selectedIndex, 0);                        // nowhere to go

  el.dispatchEvent(pointer('pointerdown', 100, 50, 3000));
  el.dispatchEvent(pointer('pointermove', 130, 200, 3010));       // more down than across
  assert.equal(el.classList.contains('cr-dragging'), false);
  el.dispatchEvent(pointer('pointermove', 20, 50, 3020, 2));      // some other pointer
  assert.equal(el.classList.contains('cr-dragging'), false);
  el.dispatchEvent(pointer('pointerup', 130, 200, 3030));
  assert.equal(carousel.selectedIndex, 0);

  // cancelled: back where it was, even after a long drag
  el.dispatchEvent(pointer('pointerdown', 250, 50, 4000));
  el.dispatchEvent(pointer('pointermove', 50, 50, 4010));
  el.dispatchEvent(pointer('pointercancel', 50, 50, 4020));
  assert.equal(carousel.selectedIndex, 0);
  assert.equal(kids[0].bounds.x, 0);
});

// ---- Drawer -----------------------------------------------------------------------------

function drawerOf(side = 'left', width = 400, height = 300) {
  const drawer = new Drawer({ side });
  drawer.setBounds(0, 0, width, height);
  drawer.layout();
  return drawer;
}

test('Drawer: closed at first, its panel on the left, 260 wide; open slides it in and says so', () => {
  const drawer = drawerOf();
  assert.deepEqual([drawer.open, drawer.side, drawer.panelSize, drawer.dismissOnTap], [false, 'left', 260, true]);
  assert.equal(drawer.element.classList.contains('cr-drawer-left'), true);
  assert.equal(drawer.layoutName, 'vbox');
  const heard = [];
  drawer.element.addEventListener('change', (e) => heard.push(e.detail.open));
  drawer.open = true;
  drawer.open = true;                            // no change, no event
  assert.equal(drawer.element.classList.contains('cr-drawer-open'), true);
  drawer.toggle();
  assert.deepEqual([drawer.open, heard], [false, [true, false]]);
  assert.equal(drawer.element.classList.contains('cr-drawer-open'), false);
});

test('Drawer: the children go in the panel, are inert while it is closed, and are laid out by its layout', () => {
  const drawer = drawerOf();
  const a = box(1, 30);
  const b = box(1, 30);
  drawer.add(a);
  drawer.add(b);
  assert.deepEqual(drawer.panel.children, [a.element, b.element]);
  assert.equal(drawer.element.children.includes(a.element), false);
  assert.deepEqual([a.element.inert, b.element.inert], [true, true]);
  drawer.layout();
  assert.deepEqual([drawer.panel.style.width, drawer.panel.style.height], ['260px', '300px']);
  assert.deepEqual([at(a), at(b)], [[0, 0, 260, 30], [0, 30, 260, 30]]);
  drawer.open = true;
  assert.deepEqual([a.element.inert, b.element.inert], [false, false]);
  const c = box(1, 10);
  drawer.add(c);                                 // added while open: usable at once
  assert.equal(c.element.inert, false);
  drawer.open = false;
  assert.equal(c.element.inert, true);
  drawer.remove(c);
  assert.equal(c.element.inert, false);
  drawer.layoutManager = 'hbox';
  drawer.layout();
  assert.deepEqual([a.bounds.x, b.bounds.x], [0, 1]);
});

test('Drawer: the panel is as wide as panelSize, or as the area when that is less; top and bottom are high', () => {
  const left = drawerOf('left');
  left.panelSize = 500;
  assert.equal(left.panel.style.width, '400px');
  left.panelSize = 120.4;
  assert.deepEqual([left.panelSize, left.panel.style.width], [120, '120px']);
  const top = drawerOf('TOP');
  assert.equal(top.side, 'top');
  const kid = box(1, 30);
  top.add(kid);
  top.layout();
  assert.deepEqual([top.panel.style.width, top.panel.style.height], ['400px', '260px']);
  assert.deepEqual(at(kid), [0, 0, 400, 30]);
  top.side = 'right';
  assert.deepEqual([top.element.classList.contains('cr-drawer-top'), top.element.classList.contains('cr-drawer-right')], [false, true]);
  assert.throws(() => { top.side = 'middle'; }, /a side must be one of left, right, top, bottom/);
  assert.equal(top.side, 'right');
});

test('Drawer: a tap on the dimmed page, a swipe toward the edge, and Escape close it', () => {
  const drawer = drawerOf();
  drawer.open = true;
  drawer.scrim.dispatchEvent(new Event('click'));
  assert.equal(drawer.open, false);

  drawer.dismissOnTap = false;
  drawer.open = true;
  drawer.scrim.dispatchEvent(new Event('click'));
  assert.equal(drawer.open, true, 'dismissOnTap false: the dimmed page is not a way out');
  key(drawer, 'Escape');
  assert.equal(drawer.open, false);
  key(drawer, 'Escape');                         // already closed: nothing
  assert.equal(drawer.open, false);

  // swipes, for each side: does the drawer stay open?
  const swipe = (d, from, to) => {
    d.open = true;
    d.panel.dispatchEvent(pointer('pointerdown', ...from));
    d.panel.dispatchEvent(pointer('pointerup', ...to));
    return d.open;
  };
  assert.equal(swipe(drawerOf('left'), [200, 100], [120, 105]), false);   // 80 toward the edge
  assert.equal(swipe(drawerOf('left'), [200, 100], [180, 100]), true);    // too short
  assert.equal(swipe(drawerOf('left'), [100, 100], [190, 100]), true);    // away from the edge
  assert.equal(swipe(drawerOf('left'), [200, 100], [140, 220]), true);    // more down than across
  assert.equal(swipe(drawerOf('right'), [100, 100], [190, 100]), false);
  assert.equal(swipe(drawerOf('top'), [100, 200], [105, 120]), false);
  assert.equal(swipe(drawerOf('bottom'), [100, 100], [100, 190]), false);
  const closed = drawerOf('left');
  closed.panel.dispatchEvent(pointer('pointerdown', 200, 100));
  closed.panel.dispatchEvent(pointer('pointerup', 100, 100));
  assert.equal(closed.open, false);
});

// ---- as a program uses them -----------------------------------------------------------------

test('a program uses a NavigationBar', () => {
  fresh();
  const id = create('NavigationBar', 'Inbox');
  assert.deepEqual(host.widget(id).box.slice(2), [320, 44]);
  assert.deepEqual([call(id, 'getTitle'), call(id, 'getBackText'), call(id, 'getActionText')], ['Inbox', '', '']);
  call(id, 'setTitle', 'Sent');
  call(id, 'setBackText', 'Mail');
  call(id, 'setActionText', 'Edit');
  assert.deepEqual([call(id, 'getTitle'), call(id, 'getBackText'), call(id, 'getActionText')], ['Sent', 'Mail', 'Edit']);
  const heard = [];
  call(id, 'onBack', callback('Back', heard));
  call(id, 'onAction', callback('Edit', heard));
  const bar = host.widget(id);
  bar.backButton.dispatchEvent(new Event('click'));
  bar.actionButton.dispatchEvent(new Event('click'));
  assert.deepEqual(heard, ['Back', 'Edit']);

  const node = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([node.class, node.title, node.backText, node.actionText], ['NavigationBar', 'Sent', 'Mail', 'Edit']);
  assert.equal(JSON.parse(call(create('NavigationBar', 'x'), 'toJson')).backText, undefined);
  const { events, ...withoutEvents } = node;
  assert.equal(events.length, 2);
  assert.deepEqual(host.save(host.build(node)), withoutEvents);
  // 44 high in a column, whatever else is there
  const column = create('Composite');
  call(column, 'setLayout', 'vbox');
  call(column, 'add', id);
  assert.equal(bar.bounds.height, 44);
});

test('a program uses a Carousel', () => {
  fresh();
  const id = create('Carousel');
  const heard = [];
  call(id, 'onSelect', (index) => heard.push(index));
  const pages = [create('Composite'), create('Composite'), create('Composite')];
  for (const p of pages) call(id, 'add', p);
  assert.deepEqual([call(id, 'getCount'), call(id, 'getSelectedIndex'), call(id, 'getChild', 1), call(id, 'isDots')], [3, 0, pages[1], true]);
  call(id, 'selectNext');
  call(id, 'select', 0);
  call(id, 'selectPrevious');                     // already the first
  call(id, 'select', 2);
  assert.throws(() => call(id, 'select', 3), (e) => e instanceof WidgetError && /index 3 is out of range 0\.\.2/.test(e.message));
  assert.deepEqual(heard, [0, 1, 0, 2]);
  assert.deepEqual(host.widget(id).children.map((p) => p.bounds.x), [-640, -320, 0]);   // 320 wide, the class's default
  call(id, 'setDots', false);
  assert.equal(call(id, 'isDots'), false);
  call(id, 'clear');
  assert.equal(call(id, 'getCount'), 0);

  const saved = create('Carousel');
  for (let i = 0; i < 3; i += 1) call(saved, 'add', create('Composite'));
  const plain = JSON.parse(call(saved, 'toJson'));
  assert.deepEqual([plain.children.length, plain.selected, plain.dots], [3, undefined, undefined]);
  assert.ok(plain.children.every((c) => c.visible === undefined));
  call(saved, 'select', 2);
  call(saved, 'setDots', false);
  const node = JSON.parse(call(saved, 'toJson'));
  assert.deepEqual([node.selected, node.dots], [2, false]);
  const rebuilt = host.build(node);
  assert.deepEqual(host.save(rebuilt), node);
  assert.deepEqual([rebuilt.selectedIndex, rebuilt.dots], [2, false]);
});

test('a program uses a Drawer', () => {
  fresh();
  const id = create('Drawer');
  const drawer = host.widget(id);
  assert.equal(drawer.fillParent, true);
  assert.deepEqual(at(drawer), [0, 0, 400, 300], 'it covers the screen');
  assert.deepEqual([call(id, 'getSide'), call(id, 'getPanelSize'), call(id, 'isOpen'), call(id, 'isDismissOnTap'), call(id, 'getLayout')],
    ['left', 260, false, true, 'vbox']);
  const heard = [];
  call(id, 'onChange', (open) => heard.push(open));
  call(id, 'setSide', 'Right');
  call(id, 'setPanelSize', 200);
  call(id, 'setOpen', true);
  call(id, 'toggle');
  call(id, 'toggle');
  call(id, 'setDismissOnTap', false);
  assert.deepEqual([call(id, 'getSide'), call(id, 'getPanelSize'), call(id, 'isOpen'), call(id, 'isDismissOnTap')], ['right', 200, true, false]);
  assert.deepEqual(heard, [true, false, true]);
  assert.throws(() => call(id, 'setSide', 'middle'), (e) => e instanceof WidgetError && /a side must be one of/.test(e.message));
  assert.equal(call(id, 'getSide'), 'right');

  // its children are laid out in the panel by its layout, which has a Composite's methods
  call(id, 'setLayout', 'hbox');
  call(id, 'setSpacing', 4);
  const kid = create('Ellipse');
  call(id, 'add', kid);
  assert.equal(call(id, 'getCount'), 1);
  assert.deepEqual(drawer.panel.children, [host.widget(kid).element]);
  assert.deepEqual(at(host.widget(kid)), [0, 0, 120, 300]);
});

test('a Drawer is saved with its side, size and state, its layout and whether it fills, and built again the same', () => {
  fresh();
  const id = create('Drawer');
  call(id, 'add', create('Ellipse'));
  const plain = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([plain.class, plain.fill, plain.side, plain.panelSize, plain.open, plain.dismissOnTap, plain.layout],
    ['Drawer', true, undefined, undefined, undefined, undefined, undefined]);
  assert.equal(plain.children.length, 1);

  call(id, 'setSide', 'bottom');
  call(id, 'setPanelSize', 180);
  call(id, 'setOpen', true);
  call(id, 'setDismissOnTap', false);
  call(id, 'setLayout', 'basic');
  const node = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([node.side, node.panelSize, node.open, node.dismissOnTap, node.layout], ['bottom', 180, true, false, 'basic']);
  const rebuilt = host.build(node);
  assert.deepEqual(host.save(rebuilt), node);
  assert.deepEqual([rebuilt.side, rebuilt.panelSize, rebuilt.open, rebuilt.dismissOnTap, rebuilt.layoutName], ['bottom', 180, true, false, 'basic']);
  assert.equal(rebuilt.children[0].element.inert, false);       // open: its children can be used

  const loose = host.build({ class: 'Drawer', fill: false });
  assert.equal(loose.fillParent, false);
  assert.equal(host.save(loose).fill, false);
  assert.equal(host.build({ class: 'Drawer' }).fillParent, true);
  assert.throws(() => host.build({ class: 'Drawer', side: 'middle' }), /a side must be one of/);
});

// ---- the designer -------------------------------------------------------------------------------

test('the designer offers the three: defaults, fields with their checks, and the code that builds them', () => {
  assert.deepEqual(newNode('NavigationBar'), { class: 'NavigationBar', title: 'Title', box: [0, 0, 320, 44] });
  assert.deepEqual(newNode('Carousel'), { class: 'Carousel', children: [], box: [0, 0, 320, 200] });
  assert.deepEqual(newNode('Drawer'), { class: 'Drawer', children: [], box: [0, 0, 320, 200] });
  const find = (node, label, opts) => fieldsFor(node, opts).flatMap(([, fs]) => fs).find((f) => f.label === label);

  const bar = newNode('NavigationBar');
  setField(bar, find(bar, 'Back button text (empty for none)'), 'Mail');
  setField(bar, find(bar, 'Action button text (empty for none)'), 'Edit');
  setField(bar, find(bar, 'Title'), 'Inbox');
  assert.deepEqual([bar.title, bar.backText, bar.actionText], ['Inbox', 'Mail', 'Edit']);
  assert.ok(fieldsFor(bar).some(([title]) => title.startsWith('Events')));

  const carousel = newNode('Carousel');
  for (let i = 0; i < 3; i += 1) addChild(carousel, newNode('Composite'));
  setField(carousel, find(carousel, 'Selected'), '2');
  setField(carousel, find(carousel, 'Page dots'), false);
  assert.deepEqual([carousel.selected, carousel.dots], [2, false]);
  assert.equal(isList(carousel), true);

  const drawer = newNode('Drawer');
  const sideField = find(drawer, 'Side (left, right, top, bottom)');
  setField(drawer, sideField, 'Right');
  setField(drawer, find(drawer, 'Panel size (pixels)'), '200');
  setField(drawer, find(drawer, 'Open'), true);
  setField(drawer, find(drawer, 'Close on tap outside'), false);
  assert.deepEqual([drawer.side, drawer.panelSize, drawer.open, drawer.dismissOnTap], ['right', 200, true, false]);
  assert.throws(() => setField(drawer, sideField, 'middle'), /a side must be one of/);
  setField(drawer, sideField, 'left');
  assert.equal(drawer.side, undefined);
  assert.equal(getField(drawer, sideField), 'left');
  assert.equal(getField(drawer, find(drawer, 'Layout')), 'vbox');
  assert.equal(isFreeParent(drawer), false);
  // a Drawer covers its container: no place of its own to set
  const groups = fieldsFor(drawer).map(([title]) => title);
  assert.ok(!groups.includes('Place'));
  assert.ok(groups.some((title) => title.startsWith('Events')));

  const page = newNode('Composite');
  addChild(page, bar);
  addChild(page, carousel);
  const menu = newNode('Drawer');
  menu.side = 'right';
  menu.panelSize = 200;
  menu.open = true;
  menu.dismissOnTap = false;
  menu.layout = 'basic';
  addChild(menu, newNode('Label'));
  addChild(page, menu);
  bar.events = [{ method: 'onBack', handler: 'GoBack' }, { method: 'onAction', handler: 'Edit' }];
  menu.events = [{ method: 'onChange', handler: 'MenuChanged' }];
  carousel.events = [{ method: 'onSelect', handler: 'PageChanged' }];
  const source = generateCode(page, { language: 'python', name: 'app' });
  assert.match(source, /bar1 = NavigationBar\("Inbox"\)/);
  assert.match(source, /bar1\.set_back_text\("Mail"\)/);
  assert.match(source, /bar1\.set_action_text\("Edit"\)/);
  assert.match(source, /bar1\.on_back\(GoBack\)/);
  assert.match(source, /bar1\.on_action\(Edit\)/);
  assert.match(source, /carousel1 = Carousel\(\)/);
  assert.match(source, /carousel1\.set_dots\(False\)/);
  assert.match(source, /carousel1\.select\(2\)/);
  assert.match(source, /def PageChanged\(sender, index\):/);
  assert.match(source, /drawer1 = Drawer\(\)/);
  assert.match(source, /drawer1\.set_layout\("basic"\)/);
  assert.match(source, /drawer1\.set_side\("right"\)/);
  assert.match(source, /drawer1\.set_panel_size\(200\)/);
  assert.match(source, /drawer1\.set_dismiss_on_tap\(False\)/);
  assert.match(source, /drawer1\.set_open\(True\)/);
  assert.match(source, /def MenuChanged\(sender, checked\):/);
  assert.match(source, /drawer1\.add\(label1\)/);
  assert.doesNotMatch(source, /drawer1\.set_bounds/);
});
