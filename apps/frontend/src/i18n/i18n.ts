/** i18n configuration using react-i18next. */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import sv from "./locales/sv.json";

export const defaultNS = "translation";

export const supportedLanguages = ["sv", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const resources = {
  en: { translation: en },
  sv: { translation: sv },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "sv",
    defaultNS,
    ns: ["translation"],
    interpolation: {
      // React already escapes values by default — no need for i18next to do it too
      escapeValue: false,
    },
    detection: {
      // Detection order: query string ?lng=sv, then browser preference
      order: ["querystring", "navigator"],
      lookupQuerystring: "lng",
    },
  });

export default i18n;
