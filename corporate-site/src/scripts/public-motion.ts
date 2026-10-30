/** Progressive decoration only: content is visible before, during and without JS. */
const targets = [
  '.bau-heading',
  '.bau-card',
  '.bau-steps > div',
  '.why-knaba-heading',
  '.why-knaba-item',
  '.home-guides-list > li',
  '.company-profile-card',
  '.knaba-partners-heading',
  '.knaba-partner-card',
].join(',');

let teardown: (() => void) | undefined;

export function initializePublicMotion(): () => void {
  if (teardown) return teardown;
  if (typeof window === 'undefined' || typeof document === 'undefined' ||
      typeof window.matchMedia !== 'function' || typeof IntersectionObserver === 'undefined') {
    return () => {};
  }

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet<Element>();
  const pending = new Set<HTMLElement>();
  const running = new Map<HTMLElement, Animation>();
  let observer: IntersectionObserver | undefined;
  let generation = 0;

  const stop = () => {
    generation++;
    observer?.disconnect();
    observer = undefined;
    pending.clear();
    for (const animation of running.values()) animation.cancel();
    running.clear();
  };

  const start = () => {
    stop();
    const body = document.querySelector<HTMLBodyElement>('body[data-public-design="vivid"]');
    if (!body || preference.matches || document.hidden ||
        body.hasAttribute('data-knaba-studio-frame') ||
        new URLSearchParams(window.location.search).get('knaba_studio_preview') === '1') return;

    // Read layout once per page/resume, never on a scroll listener. Above-fold
    // elements (including restored scroll positions) remain completely still.
    const candidates = Array.from(body.querySelectorAll<HTMLElement>(targets)).slice(0, 50);
    for (const element of candidates) {
      if (seen.has(element) || typeof element.animate !== 'function') continue;
      if (element.getBoundingClientRect().top < window.innerHeight) {
        seen.add(element);
      } else {
        pending.add(element);
      }
    }
    if (!pending.size) return;

    const current = generation;
    observer = new IntersectionObserver((entries) => {
      if (current !== generation || !body.isConnected || preference.matches || document.hidden) return;
      let stagger = 0;
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (!entry.isIntersecting || !pending.delete(element)) continue;
        observer?.unobserve(element);
        seen.add(element);
        if (!element.isConnected || element.contains(document.activeElement)) continue;
        try {
          // Preserve PR114 contrast and compose safely with CSS hover transforms.
          const animation = element.animate(
            [{ translate: '0 14px' }, { translate: '0 0' }],
            { duration: 420, delay: Math.min(stagger++, 2) * 35,
              easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)', fill: 'backwards' },
          );
          running.set(element, animation);
          const release = () => {
            if (running.get(element) === animation) running.delete(element);
          };
          animation.onfinish = release;
          animation.oncancel = release;
        } catch {
          // Optional animation APIs must never prevent reading or navigation.
        }
      }
      if (!pending.size) {
        observer?.disconnect();
        observer = undefined;
      }
    }, { threshold: 0.08 });
    for (const element of pending) observer.observe(element);
  };

  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  const onPreference = () => { if (preference.matches) stop(); else start(); };
  const onFocus = () => {
    for (const [element, animation] of running) {
      if (element.contains(document.activeElement)) {
        animation.cancel();
        running.delete(element);
      }
    }
  };

  document.addEventListener('astro:before-swap', stop);
  document.addEventListener('astro:page-load', start);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('focusin', onFocus);
  preference.addEventListener('change', onPreference);
  teardown = () => {
    stop();
    document.removeEventListener('astro:before-swap', stop);
    document.removeEventListener('astro:page-load', start);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('focusin', onFocus);
    preference.removeEventListener('change', onPreference);
    teardown = undefined;
  };
  start();
  return teardown;
}
