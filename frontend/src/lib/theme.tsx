import { create } from "zustand";

export type Theme = "light" | "dark";

const STORAGE_KEY = "ts_theme";

function read(): Theme {
  // Light is the default; we only read a stored choice (no system-pref sniffing).
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function apply(theme: Theme) {
  const html = document.documentElement;
  if (theme === "dark") html.classList.add("dark");
  else html.classList.remove("dark");
  html.style.colorScheme = theme;
}

type ThemeState = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  theme: read(),
  setTheme: (t) => {
    try { localStorage.setItem(STORAGE_KEY, t); } catch {
      /* ignore quota / private-mode errors */
    }
    apply(t);
    set({ theme: t });
  },
  toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}));

// Apply at module load so the first paint uses the stored theme — avoids
// a brief light flash when the user picked dark.
apply(useTheme.getState().theme);
