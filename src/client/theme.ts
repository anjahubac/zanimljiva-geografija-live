/**
 * Light and dark are chosen by the operating system unless the player says
 * otherwise. The choice lives on `<html data-theme>`, which the stylesheet
 * reads: absent means follow the system, `light` or `dark` overrides it.
 */
export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_STORAGE_KEY = "zg-theme";

/** Anything unrecognized — absent, corrupt, from an older build — is `system`. */
export function parseThemeChoice(raw: unknown): ThemeChoice {
  return THEME_CHOICES.includes(raw as ThemeChoice) ? (raw as ThemeChoice) : "system";
}

export function applyThemeChoice(choice: ThemeChoice, root: HTMLElement): void {
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/**
 * Storage can throw outright in a private window or with site data blocked, so
 * a missing preference must never stop the page rendering.
 */
export function readStoredTheme(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // A preference that cannot be saved still applies for this visit.
  }
}
