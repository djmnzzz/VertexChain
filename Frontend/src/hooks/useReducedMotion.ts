'use client';

import { useEffect, useState } from 'react';

/**
 * Custom hook to detect user preference for reduced motion.
 * Returns true if the user prefers reduced motion, false otherwise.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    } else if (mediaQuery.addListener) {
      // Fallback for older browsers and JSDOM environments
      mediaQuery.addListener(listener);
      return () => mediaQuery.removeListener(listener);
    }
  }, []);

  return reducedMotion;
}
