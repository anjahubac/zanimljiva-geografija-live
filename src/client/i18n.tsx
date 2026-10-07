import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CATEGORY_LABELS, LANGUAGES, type Category, type Language } from "@contracts/game.schemas";
import { STRINGS, type Strings } from "@client/strings";

/**
 * The interface language. It changes what the player reads and the language
 * of their hints — never a game rule: answers count in Serbian or English
 * whichever language is chosen here.
 */
export const LANGUAGE_STORAGE_KEY = "zg-language";

/** Anything unrecognized — absent, corrupt, from an older build — falls back. */
export function parseLanguage(raw: unknown, fallback: Language): Language {
  return LANGUAGES.includes(raw as Language) ? (raw as Language) : fallback;
}

/** Serbian for a South Slavic browser, English otherwise. */
export function browserLanguage(languages: readonly string[]): Language {
  return languages.some((tag) => /^(sr|hr|bs|sh|cnr|me)\b/i.test(tag)) ? "sr" : "en";
}

/** Storage can throw in a private window; a missing preference must never stop the page. */
export function readStoredLanguage(): Language {
  let fallback: Language = "sr";
  try {
    fallback = browserLanguage(navigator.languages ?? [navigator.language]);
    return parseLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
}

function storeLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // A preference that cannot be saved still applies for this visit.
  }
}

type I18n = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Strings;
  labels: Record<Category, string>;
};

/** Serbian unless a provider says otherwise, so a screen renders on its own in tests. */
const I18nContext = createContext<I18n>({
  language: "sr",
  setLanguage: () => {},
  t: STRINGS.sr,
  labels: CATEGORY_LABELS.sr,
});

export function I18nProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage?: Language }) {
  const [language, setLanguageState] = useState<Language>(() => initialLanguage ?? readStoredLanguage());

  useEffect(() => {
    document.documentElement.lang = language === "sr" ? "sr-Latn" : "en";
  }, [language]);

  const value = useMemo<I18n>(
    () => ({
      language,
      setLanguage: (next) => {
        setLanguageState(next);
        storeLanguage(next);
      },
      t: STRINGS[language],
      labels: CATEGORY_LABELS[language],
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

export function LanguageToggle() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="theme-toggle">
      <label htmlFor="language-choice">{t.language}</label>
      <select
        id="language-choice"
        name="language"
        value={language}
        onChange={(event) => setLanguage(parseLanguage(event.target.value, language))}
      >
        {LANGUAGES.map((value) => (
          <option value={value} key={value} lang={value === "sr" ? "sr-Latn" : "en"}>
            {t.languages[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
