// The GUI designer's model: composite widgets as node trees, and the edits
// the designer makes to them (src/ui/designer-model.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE, newNode, addChild, removeNode, moveNode, parentOf, childrenOf, outline,
  fieldsFor, getField, setField, eventsOf, toDoc, canAdd, insertChild, moveNodeTo, isWithin, pasteNode, makeIdsUnique, cloneNode,
  isFreeParent, isHorizontal, isList,
} from '../src/ui/designer-model.js';

const field = (node, label, opts) => fieldsFor(node, opts).flatMap(([, fs]) => fs).find((f) => f.label === label);

test('the palette is every class but the Viewport; new nodes get New\'s defaults', () => {
  assert.equal(PALETTE.includes('Viewport'), false);
  assert.equal(PALETTE.length, 24);
  assert.ok(PALETTE.includes('Composite') && PALETTE.includes('Stack'));
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
  assert.deepEqual(fieldsFor(label, { parent: root }).map(([title]) => title), ['Widget', 'Place', 'Box (margin, border, padding)', 'Look', 'Events (handler names)']);
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

test('insertChild puts a widget at a place in a list container, else where addChild would', () => {
  const root = newNode('VPanel');
  const [a, b, c] = ['Label', 'Button', 'Label'].map(newNode);
  insertChild(root, a); insertChild(root, c); insertChild(root, b, 1);
  assert.deepEqual(root.children, [a, b, c]);
  insertChild(root, newNode('TextPanel'), 99);
  assert.equal(root.children.length, 4);
  assert.match(insertChild(root, newNode('Window'), 0), /only be the root/);
  const split = newNode('HSplitPanel');
  assert.equal(insertChild(split, a, 0), null);
  assert.equal(split.first, a);
});

test('moveNodeTo reorders, reparents, and refuses to put a widget inside itself', () => {
  const root = newNode('VPanel');
  const row = newNode('HPanel');
  const [a, b, c] = ['Label', 'Button', 'Label'].map(newNode);
  addChild(root, a); addChild(root, b); addChild(root, row); addChild(row, c);
  assert.equal(moveNodeTo(root, a, root, 2), null);          // after b: index counts the old list
  assert.deepEqual(root.children, [b, a, row]);
  assert.equal(moveNodeTo(root, a, root, 0), null);
  assert.deepEqual(root.children, [a, b, row]);
  assert.equal(moveNodeTo(root, b, row, 0), null);           // into another container
  assert.deepEqual(row.children, [b, c]);
  assert.deepEqual(root.children, [a, row]);
  assert.match(moveNodeTo(root, row, row), /inside itself/);
  assert.match(moveNodeTo(root, row, a), /cannot hold/);
  assert.deepEqual(row.children, [b, c], 'a refused move changes nothing');
  assert.deepEqual(root.children, [a, row]);
  assert.match(moveNodeTo(root, root, row), /root/);
  assert.equal(isWithin(c, root), true);
  assert.equal(isWithin(root, c), false);
});

test('moveNodeTo restores a widget that a full split panel refuses', () => {
  const root = newNode('VPanel');
  const split = newNode('HSplitPanel');
  const [a, b, c] = ['Label', 'Button', 'Label'].map(newNode);
  addChild(root, split); addChild(split, a); addChild(split, b); addChild(root, c);
  assert.match(moveNodeTo(root, c, split), /both sides are taken/);
  assert.deepEqual(root.children, [split, c]);
  assert.equal(moveNodeTo(root, a, root, 0), null);
  assert.equal(split.first, null);
  assert.equal(moveNodeTo(root, c, split), null);
  assert.equal(split.first, c);
});

test('pasteNode adds a copy inside a container or after a leaf, with ids of its own', () => {
  const root = newNode('VPanel');
  const row = newNode('HPanel');
  const ok = newNode('Button'); ok.id = 'ok';
  addChild(root, row); addChild(row, ok);
  const copied = cloneNode(ok);
  let pasted = pasteNode(root, row, copied);          // into a container: at the end
  assert.deepEqual(row.children.map((c) => c.id), ['ok', 'ok2']);
  assert.equal(pasted.node, row.children[1]);
  pasted = pasteNode(root, ok, copied);              // beside a leaf: right after it
  assert.deepEqual(row.children.map((c) => c.id), ['ok', 'ok3', 'ok2']);
  assert.notEqual(pasted.node, copied, 'it is a copy');
  assert.equal(copied.id, 'ok', 'the clipboard is not changed');
});

test('pasteNode offsets a copy in a Panel, copies whole subtrees and says why it cannot paste', () => {
  const root = newNode('Panel');
  const box = newNode('VPanel'); box.id = 'form';
  const label = newNode('Label'); label.id = 'form';
  addChild(root, box); addChild(box, label);
  const { node } = pasteNode(root, root, box);
  assert.deepEqual(node.box.slice(0, 2), [12, 12]);
  assert.equal(node.children.length, 1);
  assert.equal(node.id, 'form2');
  assert.equal(node.children[0].id, 'form3', 'ids inside the copy stay unique too');
  assert.match(pasteNode(root, root, newNode('Window')).problem, /only be the root/);
  assert.match(pasteNode(newNode('Label'), newNode('Label'), box).problem, /cannot hold/);
});

test('fields: the box (margin, border, padding) is offered where the widget can draw it', () => {
  const labels = (cls) => (fieldsFor(newNode(cls)).find(([title]) => title.startsWith('Box'))?.[1] ?? []).map((f) => f.label);
  assert.deepEqual(labels('Label'), ['Margin', 'Border width', 'Border colour', 'Padding']);
  assert.deepEqual(labels('Button'), ['Margin', 'Border width', 'Border colour', 'Padding']);
  assert.deepEqual(labels('VPanel'), ['Margin', 'Border width', 'Border colour', 'Padding']);
  assert.deepEqual(labels('Panel'), ['Margin', 'Border width', 'Border colour']);
  assert.deepEqual(labels('ListPanel'), ['Margin', 'Border width', 'Border colour']);
  assert.deepEqual(labels('HSplitPanel'), ['Margin']);
  assert.deepEqual(labels('Ellipse'), ['Margin'], 'a shape\'s outline is its own field');
  assert.deepEqual(labels('Spacer'), []);
  assert.deepEqual(labels('Window'), []);
  assert.ok(field(newNode('RoundedRect'), 'Outline colour'));
  assert.equal(field(newNode('VPanel'), 'Spacing') !== undefined, true);
});

test('fields: margin, padding and border width are whole numbers of 0 or more; blank clears them', () => {
  const label = newNode('Label');
  const margin = field(label, 'Margin');
  assert.equal(getField(label, margin), '');
  setField(label, margin, '4.4');
  assert.equal(label.margin, 4);
  setField(label, field(label, 'Padding'), '0');
  assert.equal(label.padding, 0, 'an explicit 0 is kept: it is not the same as not set');
  setField(label, field(label, 'Border width'), '2');
  setField(label, field(label, 'Border colour'), 'red');
  assert.equal(label.borderWidth, 2);
  assert.equal(label.borderColor, 'red');
  assert.throws(() => setField(label, margin, '-1'), /Margin must be 1 to 4 numbers of 0 or more/);
  assert.throws(() => setField(label, margin, 'wide'), /Margin must be 1 to 4 numbers/);
  assert.throws(() => setField(label, margin, '1 2 3 4 5'), /Margin must be 1 to 4 numbers/);
  assert.equal(label.margin, 4, 'a refused value changes nothing');
  for (const name of ['Margin', 'Padding', 'Border width', 'Border colour']) setField(label, field(label, name), '');
  assert.deepEqual(label, { class: 'Label', text: 'Label', box: [0, 0, 100, 24] });
});

test('fields: sides are written as in CSS and kept as one number when alike', () => {
  const label = newNode('Label');
  const margin = field(label, 'Margin');
  const kept = (text) => { setField(label, margin, text); return [label.margin, getField(label, margin)]; };
  assert.deepEqual(kept('4'), [4, '4']);
  assert.deepEqual(kept('1 2'), [[1, 2, 1, 2], '1 2 1 2'], 'top and bottom, then left and right');
  assert.deepEqual(kept('1 2 3'), [[1, 2, 3, 2], '1 2 3 2'], 'top, left and right, bottom');
  assert.deepEqual(kept('1, 2, 3, 4'), [[1, 2, 3, 4], '1 2 3 4'], 'top, right, bottom, left');
  assert.deepEqual(kept('0 0 6 0'), [[0, 0, 6, 0], '0 0 6 0'], 'only the bottom');
  assert.deepEqual(kept('3 3'), [3, '3']);
});

test('Composite and Stack hold a list of children; a Composite is free only with a basic or canvas layout', () => {
  const comp = newNode('Composite');
  const stack = newNode('Stack');
  assert.deepEqual(comp, { class: 'Composite', children: [], box: [0, 0, 320, 200] });
  assert.deepEqual(stack, { class: 'Stack', children: [], box: [0, 0, 320, 200] });
  assert.equal(addChild(comp, newNode('Label')), null);
  assert.equal(addChild(stack, newNode('Label')), null);
  assert.equal(addChild(stack, newNode('Button')), null);
  assert.equal(childrenOf(stack).length, 2);
  assert.equal(isList(comp) && isList(stack), true);
  assert.equal(isFreeParent(comp), true);
  setField(comp, field(comp, 'Layout'), 'HBox');
  assert.equal(comp.layout, 'hbox');
  assert.equal(isFreeParent(comp), false);
  assert.equal(isHorizontal(comp), true);
  setField(comp, field(comp, 'Layout'), 'canvas');
  assert.equal(isFreeParent(comp), true);
  assert.equal(isHorizontal(newNode('VPanel')), false);
  assert.equal(isFreeParent(stack), false);
});

test('the inspector edits a Composite\'s layout, its settings and a child\'s place in it', () => {
  const comp = newNode('Composite');
  const child = newNode('Label');
  addChild(comp, child);
  assert.throws(() => setField(comp, field(comp, 'Layout'), 'atom'), /there is no layout 'atom'/);
  setField(comp, field(comp, 'Layout'), 'grid');
  assert.equal(comp.layout, 'grid');
  const opts = { parent: comp };
  setField(comp, field(comp, 'Spacing across'), '8');
  setField(comp, field(comp, 'Columns: index flex= size= min= max= (one a line)'), '1 flex=2\n0 size=60');
  assert.deepEqual(comp.layoutOptions, { spacingX: 8, columns: { 0: { size: 60 }, 1: { flex: 2 } } });
  assert.equal(getField(comp, field(comp, 'Columns: index flex= size= min= max= (one a line)')), '0 size=60\n1 flex=2');
  assert.throws(() => setField(comp, field(comp, 'Columns: index flex= size= min= max= (one a line)'), '1 colour=3'), /no colour setting/);
  setField(comp, field(comp, 'Spacing across'), '');
  assert.equal(comp.layoutOptions.spacingX, undefined);

  setField(child, field(child, 'Row', opts), '2');
  setField(child, field(child, 'Columns covered', opts), '3');
  setField(child, field(child, 'Align across (left, center, right)', opts), 'Right');
  assert.deepEqual(child.layoutProps, { row: 2, columnSpan: 3, alignX: 'right' });
  setField(child, field(child, 'Row', opts), '0');          // the default is not kept
  setField(child, field(child, 'Columns covered', opts), '');
  assert.deepEqual(child.layoutProps, { alignX: 'right' });
  assert.throws(() => setField(child, field(child, 'Rows covered', opts), '0'), /rowSpan must be a whole number of 1 or more/);
  assert.deepEqual(child.layoutProps, { alignX: 'right' });   // a bad value changes nothing
  setField(child, field(child, 'Align across (left, center, right)', opts), '');
  assert.equal(child.layoutProps, undefined);

  // a new layout drops the old one's settings and offers its own fields
  setField(comp, field(comp, 'Layout'), 'dock');
  assert.equal(comp.layoutOptions, undefined);
  setField(child, field(child, 'Edge (north, south, west, east, center)', opts), 'North');
  assert.deepEqual(child.layoutProps, { edge: 'north' });
  assert.equal(field(child, 'Row', opts), undefined);
  setField(comp, field(comp, 'Layout'), 'canvas');
  setField(child, field(child, 'Edges (left, top, right, bottom, width, height)', opts), '10, , 5%, , 50%, ');
  assert.deepEqual(child.layoutProps.canvas, ['10', '', '5%', '', '50%', '']);
  assert.throws(() => setField(child, field(child, 'Edges (left, top, right, bottom, width, height)', opts), '1, 2'), /six lengths/);
});

test('a Composite\'s and a Stack\'s fields: the layout group, the box, and Selected for a Stack', () => {
  const comp = newNode('Composite');
  const groups = fieldsFor(comp).map(([title]) => title);
  assert.deepEqual(groups, ['Widget', 'Place', 'Layout (basic)', 'Box (margin, border, padding)', 'Look']);
  const stack = newNode('Stack');
  assert.ok(field(stack, 'Selected'));
  const grid = newNode('Composite');
  setField(grid, field(grid, 'Layout'), 'grid');
  const labels = fieldsFor(grid).find(([title]) => title === 'Layout (grid)')[1].map((f) => f.label);
  assert.deepEqual(labels, ['Layout', 'Spacing across', 'Spacing down',
    'Columns: index flex= size= min= max= (one a line)', 'Rows: index flex= size= min= max= (one a line)']);
});
