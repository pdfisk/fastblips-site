// Device detection: decides whether the page shows the full (desktop) UI or
// the mobile UI.

/**
 * True for a phone-sized touch device. A ?ui=mobile or ?ui=desktop query
 * parameter overrides the detection. Tablets get the full UI.
 */
export function isMobileDevice(g = globalThis) {
  try {
    const ui = new URLSearchParams(g.location?.search ?? '').get('ui')?.trim().toLowerCase();
    if (ui === 'mobile') return true;
    if (ui === 'desktop') return false;
  } catch { /* no location */ }

  const nav = g.navigator ?? {};
  const ua = String(nav.userAgent ?? '');
  // Tablets get the full UI, though some of them also say "Mobile".
  if (/iPad|Tablet/i.test(ua)) return false;
  // Chromium browsers say directly whether this is a mobile device.
  if (typeof nav.userAgentData?.mobile === 'boolean') return nav.userAgentData.mobile;
  if (/iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini|Android.+Mobile|Mobi/i.test(ua)) return true;

  // Otherwise: a coarse (finger) pointer on a small screen.
  const coarse = g.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const shortSide = Math.min(g.screen?.width ?? Infinity, g.screen?.height ?? Infinity);
  return coarse && shortSide < 600;
}
