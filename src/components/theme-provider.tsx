/**
 * Theme provider for shadcn dark mode. Persists the user's choice in
 * localStorage and applies `light` / `dark` to <html> before paint via
 * a `<ScriptOnce>` so SSR doesn't flash the wrong scene.
 */
import { ScriptOnce } from "@tanstack/react-router";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "gaff-ui-theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Inline script — runs before React hydrates so the html element already
// has the right class on first paint. Kept tiny + dependency-free; the
// STORAGE_KEY constant is interpolated at module evaluation time.
const themeScript = `(function(){try{var k='${STORAGE_KEY}';var t=localStorage.getItem(k)||'system';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(r);d.style.colorScheme=r;}catch(e){}})();`;

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") {
    return theme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

type Props = {
  children: ReactNode;
  defaultTheme?: Theme;
};

export function ThemeProvider({ children, defaultTheme = "system" }: Props) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored) {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const value: ThemeContextValue = {
    theme,
    setTheme: (next) => {
      localStorage.setItem(STORAGE_KEY, next);
      setThemeState(next);
    },
  };

  return (
    <ThemeContext.Provider value={value}>
      <ScriptOnce>{themeScript}</ScriptOnce>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
