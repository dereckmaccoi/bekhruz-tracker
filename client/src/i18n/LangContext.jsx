import { createContext, useContext, useState } from 'react';
import { translations } from './translations.js';

const LangContext = createContext(null);

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');

  const changeLang = (l) => {
    localStorage.setItem('lang', l);
    setLang(l);
  };

  const t = (key, params) => {
    const dict = translations[lang] || translations.en;
    const val = dict[key] ?? translations.en[key] ?? key;
    if (typeof val === 'string') return interpolate(val, params);
    return val; // arrays (months, days) returned as-is
  };

  return (
    <LangContext.Provider value={{ lang, setLang: changeLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
