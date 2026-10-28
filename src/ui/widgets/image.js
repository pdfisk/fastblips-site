// Image: a picture shown from a source address (see docs/widgets.txt).
// Modelled on qooxdoo's qx.ui.basic.Image: a source, and how the picture is
// fitted to the box the widget is given.
//
// The source is an http: or https: address, or a data:image/ URI; '' shows
// nothing. The picture loads in the background: status goes from 'loading' to
// 'loaded' (or 'failed'), and the widget fires the browser's own load and
// error events. Until it has loaded the widget asks for DEFAULT_IMAGE_SIZE;
// after that, for the picture's own size, and its parent is laid out again.

import { Widget } from './widget.js';

/** How a picture is fitted to its box (the CSS object-fit values). */
export const FITS = Object.freeze(['contain', 'cover', 'fill', 'none', 'scale-down']);

/** The size an Image asks for until its picture has loaded: [width, height]. */
export const DEFAULT_IMAGE_SIZE = Object.freeze([100, 100]);

/** Checks a source and returns it trimmed; throws an Error saying what is wrong. */
export function checkImageSource(source) {
  const s = String(source ?? '').trim();
  if (s === '' || /^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
  throw new Error(`an image source must be an http: or https: address or a data:image/ URI, not '${s.slice(0, 40)}'`);
}

export class Image extends Widget {
  /** @param {string} [source] - where the picture is; '' for none */
  constructor(source = '') {
    super('img');
    this.element.classList.add('cr-image');
    this.element.style.cssText += ';display:block;box-sizing:border-box;object-fit:contain';
    this.element.draggable = false;
    this._source = '';
    this._fit = 'contain';
    this._status = 'empty';
    this.element.addEventListener('load', () => {
      this._status = 'loaded';
      this.parent?.layout?.();    // its natural size is known now
    });
    this.element.addEventListener('error', () => { this._status = 'failed'; });
    this.source = source;
  }

  /** The address of the picture ('' for none). */
  get source() { return this._source; }
  set source(value) {
    this._source = checkImageSource(value);
    this._status = this._source === '' ? 'empty' : 'loading';
    if (this._source === '') this.element.removeAttribute?.('src');
    else this.element.src = this._source;
  }

  /** How the picture fits its box: one of FITS. */
  get fit() { return this._fit; }
  set fit(value) {
    const fit = String(value).trim().toLowerCase();
    if (!FITS.includes(fit)) throw new Error(`a fit must be one of ${FITS.join(', ')}, not '${value}'`);
    this._fit = fit;
    this.element.style.objectFit = fit;
  }

  /** Text shown (and read aloud) when the picture cannot be. */
  get alt() { return this.element.alt ?? ''; }
  set alt(value) { this.element.alt = String(value); }

  /** 'empty' (no source), 'loading', 'loaded' or 'failed'. */
  get status() { return this._status; }

  /** The picture's own width in pixels; 0 until it has loaded. */
  get naturalWidth() { return this._status === 'loaded' ? this.element.naturalWidth || 0 : 0; }

  /** The picture's own height in pixels; 0 until it has loaded. */
  get naturalHeight() { return this._status === 'loaded' ? this.element.naturalHeight || 0 : 0; }

  preferredWidth() { return this.naturalWidth || DEFAULT_IMAGE_SIZE[0]; }

  preferredHeight() { return this.naturalHeight || DEFAULT_IMAGE_SIZE[1]; }
}
