import { locales } from "./locales.js";
import "https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/dist/cookieconsent.umd.js";

const ccLocales = {};
["en", "fr"].forEach((lang) => {
  if (locales[lang] && locales[lang].cookie_consent) {
    ccLocales[lang] = locales[lang].cookie_consent;
  }
});

// Enable dark mode
document.documentElement.classList.add("cc--darkmode");

// Build a minimal config
CookieConsent.run({
  guiOptions: {
    consentModal: {
      layout: "box inline",
      position: "bottom right",
      equalWeightButtons: false,
      flipButtons: true,
    },
    preferencesModal: {
      layout: "box",
      position: "right",
      equalWeightButtons: false,
      flipButtons: true,
    },
  },
  categories: {
    necessary: { readOnly: true },
    analytics: { readOnly: false },
  },
  language: {
    default: "en",
    autoDetect: "browser",
    translations: ccLocales,
  },
});
