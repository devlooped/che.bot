import { useSyncExternalStore } from "react";

// The theme of the page: light by default, dark when the reader picks it with the header's switch.
// The choice is kept in this browser; index.html applies it before the first paint, so a dark page
// never flashes light. The CSS reads `data-theme` on <html>; the charts read the theme from here.

export type Theme = "light" | "dark";

/** The key of the choice in localStorage; index.html reads the same key. */
export const THEME_KEY = "che.theme";

const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // a browser without storage keeps the choice for this page only
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The theme of the page; a component that reads it is drawn again when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "light");
}
