import { locales } from "./locales.js";
import "https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/dist/cookieconsent.umd.js";

const ccLocales = {};
Object.entries(locales).forEach(([lang, data]) => {
  if (data.cookie_consent) {
    ccLocales[lang] = data.cookie_consent;
  }
});

// List countries with opt-in privacy laws
const euCountries = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
  'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  'IS','LI','NO','UK', 'BR', 'CA', 'EG', 'ZA'
];

// Set caching value
const CACHE_KEY = 'userCountryCode';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCachedCountry() {
  const entry = localStorage.getItem(CACHE_KEY);
  if (!entry) return null;

  try {
    const { code, ts } = JSON.parse(entry);
    if (Date.now() - ts < CACHE_DURATION) {
      return code;
    } else {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function cacheCountry(code) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ code, ts: Date.now() }));
}

// Initialize Consent pop-up
function initConsent(userCountry) {
  const dynamicMode = euCountries.includes(userCountry) ? 'opt-in' : 'opt-out';
  CookieConsent.run({
      mode: dynamicMode,
      guiOptions: {
      consentModal: {
        layout: "box inline",
        position: "bottom right",
        equalWeightButtons: true,
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
}

const cachedCountry = getCachedCountry();

if (cachedCountry) {
  initConsent(cachedCountry);
} else {
  fetch('https://ipapi.co/json/')
    .then(res => res.json())
    .then(data => {
      const code = data.country_code;
      if (code) {
        cacheCountry(code);
        initConsent(code);
      } else {
        initConsent('FR'); // fallback: safe opt-in
      }
    })
    .catch(() => {
      initConsent('FR'); // fallback: safe opt-in
    });
}

// Enable dark mode
document.documentElement.classList.add("cc--darkmode");
