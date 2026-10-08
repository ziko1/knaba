import {useEffect, useRef, useState} from 'react';

// Keep this breakpoint aligned with responsive.css. The sidebar becomes a
// modal drawer whenever a permanent navigation column would crowd the content.
const compactNavigation = '(max-width: 1024px)';

export function useResponsiveNavigation(open: boolean, onClose: () => void) {
  const [compact, setCompact] = useState(() => window.matchMedia(compactNavigation).matches);
  const navigationRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const query = window.matchMedia(compactNavigation);
    const update = () => {
      setCompact(query.matches);
      if (!query.matches) closeRef.current();
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!compact || !open) return;
    const navigation = navigationRef.current;
    if (!navigation) return;
    const before = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => Array.from(navigation.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0);
    document.body.style.overflow = 'hidden';
    navigation.querySelector<HTMLElement>('.sidebar-brand button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !navigation.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !navigation.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      // Wait for React to remove inert from the main area before restoring focus.
      requestAnimationFrame(() => {
        const target = before?.isConnected ? before : toggleRef.current;
        if (target?.getClientRects().length && !target.closest('[inert]')) target.focus();
      });
    };
  }, [compact, open]);

  return {compact, drawerOpen: compact && open, navigationRef, toggleRef};
}
