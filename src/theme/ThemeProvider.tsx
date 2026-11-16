import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useDatabase } from '../db/DatabaseProvider';
import { subscribeDbChange } from '../db/events';
import { getSetting, setSetting } from '../db/settings';
import {
  palettes,
  ThemeContext,
  type ColorSchemeName,
  type ThemeContextValue,
  type ThemeMode,
} from './index';

const THEME_KEY = 'theme_mode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Theme provider managing theme mode, persistence, and system theme changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const systemScheme = useColorScheme();

  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = getSetting(database, THEME_KEY);
    return isThemeMode(stored) ? stored : 'system';
  });

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      setSetting(database, THEME_KEY, next);
    },
    [database],
  );

  // Sync state if settings changed elsewhere (backup restore or settings tab).
  useEffect(() => {
    return subscribeDbChange(() => {
      const stored = getSetting(database, THEME_KEY);
      if (isThemeMode(stored) && stored !== mode) {
        setModeState(stored);
      }
    });
  }, [database, mode]);

  const scheme: ColorSchemeName =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const toggle = useCallback(() => {
    setModeState((current) => {
      const resolved =
        current === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : current;
      const next: ThemeMode = resolved === 'dark' ? 'light' : 'dark';
      setSetting(database, THEME_KEY, next);
      return next;
    });
  }, [database, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, scheme, colors: palettes[scheme], setMode, toggle }),
    [mode, scheme, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
