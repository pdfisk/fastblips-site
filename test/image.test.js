// Image: the toolkit widget (src/ui/widgets/image.js) over a small stand-in
// for the DOM, as a program sees it through the widget host, and in the
// designer (model and code generator).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { newNode, fieldsFor, getField, setField } from '../src/ui/designer-model.js';
import { generateCode } from '../src/ui/designer-codegen.js';

class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.textContent = '';
    const names = new Set();
    this.classList = { add: (n) => names.add(n), contains: (n) => names.has(n), remove: (n) => names.delete(n) };
  }
  appendChild(child) { this.children.push(child); return child; }
  contains(other) { return other === this || this.children.some((c) => c.contains(other)); }
  removeAttribute(name) { delete this[name]; }
  remove() {}
  setAttribute() {}
}

let Image;
let Composite;
let checkImageSource;
let FITS;
let ProgramWidgetHost;
let FreeLayer;
let WidgetError;
let host;

/** Pretends the browser has loaded the picture: its own size is w by h. */
function loaded(widget, w, h) {
  widget.element.naturalWidth = w;
  widget.element.naturalHeight = h;
  widget.element.dispatchEvent(new Event('load'));
}

const create = (cls, ...args) => host.create(cls, args);
const call = (id, method, ...args) => host.call(id, method, args);

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  ({ Image, checkImageSource, FITS } = await import('../src/ui/widgets/image.js'));
  ({ Composite } = await import('../src/ui/widgets/composite.js'));
  ({ ProgramWidgetHost, FreeLayer } = await import('../src/ui/program-widgets.js'));
  ({ WidgetError } = await import('../src/vm/runtime/widgets.js'));
});

function fresh() {
  const layer = new FreeLayer();
  layer.setBounds(0, 0, 400, 300);
  host = new ProgramWidgetHost(layer);
}

test('a source is an http(s) address, a data:image URI, or empty', () => {
  assert.equal(checkImageSource(''), '');
  assert.equal(checkImageSource('  https://example.com/cat.png '), 'https://example.com/cat.png');
  assert.equal(checkImageSource('HTTP://example.com/a.gif'), 'HTTP://example.com/a.gif');
  assert.equal(checkImageSource('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  for (const bad of ['cat.png', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x/y.png']) {
    assert.throws(() => checkImageSource(bad), /must be an http: or https: address or a data:image\/ URI/, bad);
  }
});

test('Image: loads in the background, asks for its own size once it has, and lays its parent out again', () => {
  const img = new Image('https://example.com/cat.png');
  assert.equal(img.element.src, 'https://example.com/cat.png');
  assert.equal(img.status, 'loading');
  assert.deepEqual([img.preferredWidth(), img.preferredHeight()], [100, 100]);
  assert.deepEqual([img.naturalWidth, img.naturalHeight], [0, 0]);

  const row = new Composite({ layout: 'hbox' });
  row.setBounds(0, 0, 300, 100);
  row.add(img);
  row.layout();
  assert.equal(img.bounds.width, 100);
  loaded(img, 40, 30);
  assert.equal(img.status, 'loaded');
  assert.deepEqual([img.naturalWidth, img.naturalHeight], [40, 30]);
  assert.equal(img.bounds.width, 40);           // the row was laid out again

  img.element.dispatchEvent(new Event('error'));
  assert.equal(img.status, 'failed');
  assert.equal(img.naturalWidth, 0);
  img.source = '';
  assert.equal(img.status, 'empty');
  assert.throws(() => { img.source = 'nope.png'; }, /http: or https:/);
});

test('Image: fit and alt text', () => {
  const img = new Image();
  assert.equal(img.fit, 'contain');
  img.fit = ' Cover ';
  assert.equal(img.fit, 'cover');
  assert.equal(img.element.style.objectFit, 'cover');
  assert.throws(() => { img.fit = 'stretch'; }, /a fit must be one of contain, cover, fill, none, scale-down/);
  img.alt = 'A cat';
  assert.equal(img.alt, 'A cat');
  assert.deepEqual([...FITS], ['contain', 'cover', 'fill', 'none', 'scale-down']);
});

test('a program makes an Image and changes it through methods; bad values are errors it sees', () => {
  fresh();
  const id = create('Image', 'https://example.com/a.png');
  assert.equal(call(id, 'getSource'), 'https://example.com/a.png');
  assert.equal(call(id, 'isLoaded'), false);
  call(id, 'setSource', 'data:image/gif;base64,R0lGOD');
  call(id, 'setFit', 'COVER');
  call(id, 'setAlt', 'logo');
  assert.deepEqual([call(id, 'getFit'), call(id, 'getAlt')], ['cover', 'logo']);
  assert.throws(() => call(id, 'setSource', 'logo.png'), (e) => e instanceof WidgetError && /http: or https:/.test(e.message));
  assert.throws(() => call(id, 'setFit', 'stretch'), /a fit must be one of/);
  assert.throws(() => create('Image', 'file:///x.png'), WidgetError);
  assert.equal(call(id, 'getSource'), 'data:image/gif;base64,R0lGOD');   // a bad value changes nothing

  // the box is the class's default until the picture has loaded, then its own size
  const image = host.widget(id);
  assert.deepEqual([image.box[2], image.box[3]], [100, 100]);
  loaded(image, 64, 48);
  assert.deepEqual([call(id, 'isLoaded'), call(id, 'getNaturalWidth'), call(id, 'getNaturalHeight')], [true, 64, 48]);
  assert.equal(image.preferredWidth(), 64);
});

test('onLoad and onError call the program\'s handlers with the image', () => {
  fresh();
  const id = create('Image', 'https://example.com/a.png');
  const heard = [];
  const on = (name) => { const f = () => heard.push(name); f.handlerName = name; return f; };
  call(id, 'onLoad', on('Loaded'));
  call(id, 'onError', on('Failed'));
  call(id, 'onClick', on('Clicked'));
  const image = host.widget(id);
  loaded(image, 10, 10);
  image.element.dispatchEvent(new Event('error'));
  image.element.dispatchEvent(new Event('click'));
  assert.deepEqual(heard, ['Loaded', 'Failed', 'Clicked']);
});

test('an Image is saved with its source, fit and alt text, and built again the same', () => {
  fresh();
  const id = create('Image', 'https://example.com/a.png');
  call(id, 'setId', 'logo');
  const plain = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([plain.class, plain.source, plain.fit, plain.alt], ['Image', 'https://example.com/a.png', undefined, undefined]);
  call(id, 'setFit', 'none');
  call(id, 'setAlt', 'Our logo');
  const node = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([node.fit, node.alt], ['none', 'Our logo']);
  const rebuilt = host.build(node);
  assert.deepEqual(host.save(rebuilt), node);
  assert.equal(rebuilt.fit, 'none');
  assert.throws(() => host.build({ class: 'Image', source: 'x.png' }), /http: or https:/);
  assert.throws(() => host.build({ class: 'Image', source: '', fit: 'stretch' }), /a fit must be one of/);
});

test('the designer offers an Image: its fields, with their checks, and the code that builds it', () => {
  const node = newNode('Image');
  assert.deepEqual(node, { class: 'Image', source: '', box: [0, 0, 100, 100] });
  const field = (label) => fieldsFor(node).flatMap(([, fs]) => fs).find((f) => f.label.startsWith(label));
  setField(node, field('Source'), 'https://example.com/cat.png');
  setField(node, field('Fit'), 'Cover');
  setField(node, field('Alt'), 'A "cat"');
  assert.deepEqual([node.source, node.fit, node.alt], ['https://example.com/cat.png', 'cover', 'A "cat"']);
  assert.throws(() => setField(node, field('Source'), 'cat.png'), /http: or https:/);
  assert.throws(() => setField(node, field('Fit'), 'stretch'), /a fit must be one of/);
  assert.equal(getField(node, field('Source')), 'https://example.com/cat.png');
  assert.ok(fieldsFor(node).some(([title]) => title.startsWith('Events')));
  setField(node, field('Fit'), 'contain');                  // the default is not kept
  assert.equal(node.fit, undefined);
  setField(node, field('Fit'), 'fill');
  const source = generateCode(node, { language: 'python', name: 'pic' });
  assert.match(source, /root = Image\("https:\/\/example\.com\/cat\.png"\)/);
  assert.match(source, /root\.set_fit\("fill"\)/);
  assert.match(source, /root\.set_alt\("A \\"cat\\""\)/);
});
