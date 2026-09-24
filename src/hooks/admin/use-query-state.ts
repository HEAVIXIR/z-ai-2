'use client';

import * as React from 'react';

/**
 * A lightweight URL-search-params-backed state hook.
 *
 * Usage:
 *   const [search, setSearch] = useQueryState('search', '');
 *
 * The value is stored in the URL's query string, so the state is shareable
 * and survives refresh. On mount, reads from the URL; on set, updates both
 * the URL (via history.replaceState) and the React state.
 *
 * Note: this is a *soft* sync — we don't subscribe to popstate. That's fine
 * for admin pages where the URL is the source of truth initiated by user
 * interaction.
 */
export function useQueryState(key: string, defaultValue: string): [string, (v: string) => void] {
  const [value, setValue] = React.useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    const params = new URLSearchParams(window.location.search);
    return params.get(key) ?? defaultValue;
  });

  const set = React.useCallback((v: string) => {
    setValue(v);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (v === '' || v === defaultValue) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, v);
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, [key, defaultValue]);

  return [value, set];
}
