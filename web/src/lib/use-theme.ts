import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const KEY = "theme";
const mql = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {
    /* private mode */
  }
  return "system";
}

function resolve(t: Theme): ResolvedTheme {
  if (t === "system") return mql.matches ? "dark" : "light";
  return t;
}

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", resolve(t) === "dark");
}

function emit() {
  for (const l of listeners) l();
}

/** Set the theme for this browser. Applies immediately; persists to localStorage. */
export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode */
  }
  apply(t);
  emit();
}

// Follow the OS while on "system", and stay in sync across tabs.
mql.addEventListener("change", () => {
  if (read() === "system") {
    apply("system");
    emit();
  }
});
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    apply(read());
    emit();
  }
});
apply(read()); // keep in step with the pre-paint boot script

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
  );
  return { theme, resolvedTheme: resolve(theme), setTheme };
}
