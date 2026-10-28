/** Decorative, one-shot entrances; no hidden content or persistent render loop. */
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
let dispose = () => {};

function initializeVisualMotion() {
  dispose();
  if (preference.matches || !('IntersectionObserver' in window) || !('animate' in Element.prototype)) return;
  const animations = new Set<Animation>();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (entry.target.contains(document.activeElement)) continue;
      const animation = entry.target.animate(
        [{ translate: '0 14px' }, { translate: '0 0' }],
        { duration: 440, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
      animations.add(animation);
      animation.addEventListener('finish', () => animations.delete(animation), { once: true });
    }
  }, { threshold: 0.08 });
  // Keep forms, live regions, the carousel track and authenticated tools out of motion.
  document.querySelectorAll('.bau-hero-copy, .bau-heading, #bau-services .bau-card, .bau-steps>div, .home-guides-copy, .home-guides-list>li, .company-profile-intro, .why-knaba-heading, .why-knaba-item, .bau-end-cta').forEach(element => observer.observe(element));
  dispose = () => {
    observer.disconnect();
    animations.forEach(animation => animation.cancel());
    animations.clear();
  };
}

document.addEventListener('astro:page-load', initializeVisualMotion);
document.addEventListener('astro:before-swap', () => dispose());
preference.addEventListener('change', initializeVisualMotion);
initializeVisualMotion();
