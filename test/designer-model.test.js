// The GUI designer's model: composite widgets as node trees, and the edits
// the designer makes to them (src/ui/designer-model.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE, newNode, addChild, removeNode, moveNode, parentOf, childrenOf, outline,
  fieldsFor, getField, setField, eventsOf, toDoc, canAdd,
} from '../src/ui/designer-model.js';

const field = (node, label, opts) => fieldsFor(node, opts).flatMap(([, fs]) => fs).find((f) => f.label === label);

test('the palette is every class but the Viewport; new nodes get New\'s defaults', () => {
  assert.equal(PALETTE.includes('Viewport'), false);
  assert.equal(PALETTE.length, 15);
  assert.deepEqual(PALETTE, [...PALETTE].sort((a, b) => a.localeCompare(b)), 'palette is alphabetical');
  assert.deepEqual(newNode('Button'), { class: 'Button', text: 'Button', box: [0, 0, 100, 32] });
  assert.deepEqual(newNode('HSplitPanel'), { class: 'HSplitPanel', position: 0.5, first: null, second: null, box: [0, 0, 320, 200] });
  assert.deepEqual(newNode('Window').bounds, [20, 20, 320, 240]);
  assert.throws(() => newNode('Viewport'), /no widget class/);
});

test('adding children: lists, tabs, split sides, a window\'s content and button bar', () => {
  const root = newNode('VPanel');
  assert.equal(addChild(root, newNode('Label')), null);
  const split = newNode('VSplitPanel');
  addChild(root, split);
  addChild(split, newNode('TextPanel'));
  addChild(split, newNode('ListPanel'));
  assert.equal(canAdd(split), false);
  assert.match(addChild(split, newNode('Label')), /both sides are taken/);
  const tabs = newNode('TabPanel');
  addChild(root, tabs);
  addChild(tabs, newNode('Panel'));
  addChild(tabs, newNode('Panel'));
  assert.deepEqual(tabs.tabs.map((t) => t.label), ['Tab 1', 'Tab 2']);
  assert.match(addChild(root, newNode('Window')), /can only be the root/);
  assert.match(addChild(newNode('Label'), newNode('Label')), /cannot hold other widgets/);

  const win = newNode('Window');
  addChild(win, newNode('VPanel'));
  addChild(win, newNode('Button'));
  assert.equal(win.content.class, 'VPanel');
  assert.deepEqual(win.buttonBar.children.map((n) => n.class), ['Button']);

  assert.deepEqual(outline(root).map((r) => r.text), [
    'VPanel',
    '    Label "Label"',
    '    VSplitPanel',
    '        (first) TextPanel',
    '        (second) ListPanel',
    '    TabPanel',
    '        [Tab 1] Panel',
    '        [Tab 2] Panel',
  ]);
  assert.deepEqual(outline(win).map((r) => r.text), ['Window "Window"', '    VPanel', '    (button bar) Button "Button"']);
});

test('removing and moving', () => {
  const root = newNode('HPanel');
  const [a, b, c] = ['A', 'B', 'C'].map((t) => ({ ...newNode('Button'), text: t }));
  [a, b, c].forEach((n) => addChild(root, n));
  assert.equal(moveNode(root, c, -1), null);
  assert.deepEqual(childrenOf(root).map((n) => n.text), ['A', 'C', 'B']);
  assert.match(moveNode(root, a, -1), /already at the end/);
  assert.equal(removeNode(root, c), null);
  assert.deepEqual(childrenOf(root).map((n) => n.text), ['A', 'B']);
  assert.match(removeNode(root, root), /root cannot be deleted/);
  assert.equal(parentOf(root, b), root);

  const split = newNode('HSplitPanel');
  const l = newNode('Label');
  addChild(split, l);
  moveNode(split, l, 1);
  assert.deepEqual([split.first, split.second], [null, l]);
});

test('fields: place and size follow the widget\'s parent; a width set is a fixed width', () => {
  const root = newNode('VPanel');
  const label = newNode('Label');
  addChild(root, label);
  assert.deepEqual(fieldsFor(label, { parent: root }).map(([title]) => title), ['Widget', 'Place', 'Look', 'Events (handler names)']);
  assert.deepEqual(fieldsFor(label, { parent: root })[1][1].map((f) => f.label), ['Width', 'Height', 'Flex']);
  assert.deepEqual(fieldsFor(root, { isRoot: true })[1][1].map((f) => f.label), ['Left', 'Top', 'Width', 'Height', 'Fill its area']);

  const height = field(label, 'Height', { parent: root });
  setField(label, height, '30');
  assert.equal(label.height, 30);
  assert.deepEqual(label.box, [0, 0, 100, 30]);
  setField(label, height, '');
  assert.equal('height' in label, false);
  assert.throws(() => setField(label, height, 'tall'), /Height must be a number/);
  setField(label, field(label, 'Flex', { parent: root }), '2');
  assert.equal(label.flex, 2);
  setField(label, field(label, 'Id'), 'total');
  setField(label, field(label, 'Id'), '');
  assert.equal('id' in label, false);
});

test('fields: list items, menu items, tab labels, events', () => {
  const list = newNode('ListPanel');
  setField(list, field(list, 'Items (one a line)'), 'red\ngreen\r\nblue');
  assert.deepEqual(list.items, ['red', 'green', 'blue']);

  const menu = newNode('Menu');
  const items = field(menu, 'Items: Label = Handler, - for a line');
  setField(menu, items, 'Open = OpenFile\n-\nQuit=Quit\nAbout');
  assert.deepEqual(menu.items, [
    { label: 'Open', handler: 'OpenFile' }, { separator: true }, { label: 'Quit', handler: 'Quit' }, { label: 'About', handler: null },
  ]);
  assert.equal(getField(menu, items), 'Open = OpenFile\n-\nQuit = Quit\nAbout');

  const tabs = newNode('TabPanel');
  addChild(tabs, newNode('Panel'));
  setField(tabs, field(tabs, 'Tab labels (one a line)'), 'Home');
  assert.equal(tabs.tabs[0].label, 'Home');

  assert.deepEqual(eventsOf('ListPanel'), ['onSelect']);
  assert.deepEqual(eventsOf('TextPanel'), ['onChange', 'onSubmit']);
  const button = newNode('Button');
  setField(button, field(button, 'onClick'), 'Pressed');
  assert.deepEqual(button.events, [{ method: 'onClick', handler: 'Pressed' }]);
  setField(button, field(button, 'onClick'), ' ');
  assert.equal('events' in button, false);
  setField(button, field(button, 'Enabled'), false);
  assert.equal(button.enabled, false);
  setField(button, field(button, 'Enabled'), true);
  assert.equal('enabled' in button, false);

  assert.deepEqual(toDoc(button), { format: 'fastblip-viewport', version: 1, kind: 'composite', root: button });
});
