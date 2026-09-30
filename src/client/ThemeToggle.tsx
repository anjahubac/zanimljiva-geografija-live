import { useEffect, useState } from "react";
import {
  applyThemeChoice,
  readStoredTheme,
  storeTheme,
  THEME_CHOICES,
  type ThemeChoice,
} from "@client/theme";
import { useI18n } from "@client/i18n";

export function ThemeToggle() {
  const { t } = useI18n();
  const [choice, setChoice] = useState<ThemeChoice>(() => readStoredTheme());

  useEffect(() => {
    applyThemeChoice(choice, document.documentElement);
  }, [choice]);

  return (
    <div className="theme-toggle">
      <label htmlFor="theme-choice">{t.theme}</label>
      <select
        id="theme-choice"
        name="theme"
        value={choice}
        onChange={(event) => {
          const next = event.target.value as ThemeChoice;
          setChoice(next);
          storeTheme(next);
        }}
      >
        {THEME_CHOICES.map((value) => (
          <option value={value} key={value}>
            {t.themes[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
