/**
 * Light / dark / auto theme.
 *
 * The preference is saved in localStorage and applied as
 * <html data-theme="light|dark">. "auto" follows the device setting and
 * updates live if the user switches their OS theme. The inline script in
 * _document.jsx applies the saved theme before first paint, so there's no flash.
 */
import { useCallback, useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'theme';
const PREFERENCES = ['light', 'dark', 'system'];

function readSaved() {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return PREFERENCES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export default function useTheme() {
  const [preference, setPreferenceState] = useState(null); // null until read on the client
  const [resolved, setResolved] = useState('light');

  useEffect(() => {
    setPreferenceState(readSaved());
  }, []);

  useEffect(() => {
    if (!preference) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      setResolved(theme);
    };

    apply();
    if (preference !== 'system') return undefined;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const setPreference = useCallback((next) => {
    if (!PREFERENCES.includes(next)) return;
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode: the choice simply isn't remembered */
    }
  }, []);

  return { preference: preference || 'system', resolved, setPreference };
}
