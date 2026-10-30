import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializePublicMotion } from '../src/scripts/public-motion';

// Exercise lifecycle with native EventTarget and deterministic observer/animation
// boundaries. These unit checks do not substitute for browser visual acceptance.
class MediaPreference extends EventTarget {
  matches = false;
  set(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}

function card(top = 1000) {
  const animations: ReturnType<typeof animation>[] = [];
  const element = {
    isConnected: true,
    child: {},
    getBoundingClientRect: vi.fn(() => ({ top })),
    contains(node: unknown): boolean { return node === element || node === element.child; },
    animate: vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => {
      const result = animation(); animations.push(result); return result;
    }),
  };
  return { element, animations };
}

function animation() {
  const result = {
    onfinish: null as (() => void) | null,
    oncancel: null as (() => void) | null,
    cancel: vi.fn(() => result.oncancel?.()),
  };
  return result;
}

type Card = ReturnType<typeof card>;
const observers: FakeObserver[] = [];
class FakeObserver {
  observed = new Set<unknown>();
  observe = vi.fn((element: unknown) => this.observed.add(element));
  unobserve = vi.fn((element: unknown) => this.observed.delete(element));
  disconnect = vi.fn(() => this.observed.clear());
  constructor(readonly callback: IntersectionObserverCallback) { observers.push(this); }
  enter(cards: Card[], intersects = true) {
    this.callback(cards.map(({ element }) => ({ target: element, isIntersecting: intersects })) as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

function fixture(cards: Card[], options: { public?: boolean; preview?: boolean; reduced?: boolean } = {}) {
  const preference = new MediaPreference();
  preference.matches = options.reduced ?? false;
  let elements = cards;
  const body = {
    isConnected: true,
    hasAttribute: vi.fn(() => false),
    querySelectorAll: vi.fn(() => elements.map(item => item.element)),
  };
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    activeElement: null as unknown,
    querySelector: vi.fn(() => options.public === false ? null : body),
  });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', {
    innerHeight: 800,
    matchMedia: vi.fn(() => preference),
    location: { search: options.preview ? '?knaba_studio_preview=1' : '' },
  });
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return {
    document, preference, body,
    nextPage(next: Card[]) { elements = next; document.dispatchEvent(new Event('astro:page-load')); },
  };
}

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.(); dispose = undefined;
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe('public decorative motion', () => {
  it.each([{ public: false }, { preview: true }, { reduced: true }])('leaves excluded or reduced-motion pages entirely still: %j', options => {
    const target = card(); fixture([target], options);
    dispose = initializePublicMotion();
    expect(observers).toHaveLength(0);
    expect(target.element.animate).not.toHaveBeenCalled();
  });

  it('leaves the initial viewport still and animates each offscreen target only once', () => {
    const visible = card(100), below = card(); fixture([visible, below]);
    dispose = initializePublicMotion();
    expect(observers[0].observed).toEqual(new Set([below.element]));
    observers[0].enter([below], false);
    expect(below.element.animate).not.toHaveBeenCalled();
    observers[0].enter([visible, below]);
    observers[0].enter([below]);
    expect(visible.element.animate).not.toHaveBeenCalled();
    expect(below.element.animate).toHaveBeenCalledOnce();
    expect(below.element.animate.mock.calls[0][0]).toEqual([
      { translate: '0 14px' }, { translate: '0 0' },
    ]);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });

  it('bounds observation and staggering on long pages', () => {
    const cards = Array.from({ length: 90 }, () => card()); fixture(cards);
    dispose = initializePublicMotion();
    expect(observers[0].observed.size).toBe(50);
    observers[0].enter(cards);
    expect(cards.filter(item => item.element.animate.mock.calls.length)).toHaveLength(50);
    for (const item of cards.slice(0, 50)) {
      expect(item.element.animate.mock.calls[0][1].delay).toBeLessThanOrEqual(70);
    }
  });

  it('never starts motion around keyboard focus and cancels when focus enters an active card', () => {
    const focused = card(), other = card();
    const view = fixture([focused, other]);
    view.document.activeElement = focused.element.child;
    dispose = initializePublicMotion();
    observers[0].enter([focused, other]);
    expect(focused.element.animate).not.toHaveBeenCalled();
    view.document.activeElement = other.element.child;
    view.document.dispatchEvent(new Event('focusin'));
    expect(other.animations[0].cancel).toHaveBeenCalledOnce();
  });

  it('cancels motion immediately when reduced motion changes and ignores stale observer work', () => {
    const active = card(), queued = card();
    const view = fixture([active, queued]); dispose = initializePublicMotion();
    const old = observers[0]; old.enter([active]);
    view.preference.set(true);
    expect(active.animations[0].cancel).toHaveBeenCalledOnce();
    expect(old.disconnect).toHaveBeenCalledOnce();
    old.enter([queued]);
    expect(queued.element.animate).not.toHaveBeenCalled();
    view.preference.set(false);
    expect(observers[1].observed).toEqual(new Set([queued.element]));
  });

  it('cancels on backgrounding and resumes without replaying completed cards', () => {
    const active = card(), queued = card();
    const view = fixture([active, queued]); dispose = initializePublicMotion();
    observers[0].enter([active]);
    view.document.hidden = true;
    view.document.dispatchEvent(new Event('visibilitychange'));
    expect(active.animations[0].cancel).toHaveBeenCalledOnce();
    view.document.hidden = false;
    view.document.dispatchEvent(new Event('visibilitychange'));
    expect(observers[1].observed).toEqual(new Set([queued.element]));
  });

  it('cleans Astro page swaps and guards duplicate initializers and final disposal', () => {
    const first = card(), pending = card(), next = card();
    const view = fixture([first, pending]); dispose = initializePublicMotion();
    expect(initializePublicMotion()).toBe(dispose);
    expect(observers).toHaveLength(1);
    const old = observers[0]; old.enter([first]);
    view.document.dispatchEvent(new Event('astro:before-swap'));
    expect(first.animations[0].cancel).toHaveBeenCalledOnce();
    old.enter([pending]);
    expect(pending.element.animate).not.toHaveBeenCalled();
    view.nextPage([next]);
    expect(observers).toHaveLength(2);
    expect(observers[1].observed).toEqual(new Set([next.element]));
    dispose(); dispose = undefined;
    view.nextPage([card()]); view.preference.set(true); view.preference.set(false);
    expect(observers).toHaveLength(2);
  });

  it('degrades without optional APIs and tolerates an animation failure', () => {
    const target = card(); fixture([target]);
    vi.stubGlobal('IntersectionObserver', undefined);
    dispose = initializePublicMotion();
    expect(observers).toHaveLength(0);
    dispose();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    target.element.animate.mockImplementation(() => { throw new Error('Optional animation is unavailable'); });
    dispose = initializePublicMotion();
    expect(() => observers[0].enter([target])).not.toThrow();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });
});
