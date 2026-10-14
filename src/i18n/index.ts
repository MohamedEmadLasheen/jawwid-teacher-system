import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';

const savedLang = localStorage.getItem('jtis_lang') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

// Apply the saved language's direction before React's first render.
// index.html ships <html dir="rtl">, and DirectionSetter (App.tsx) corrects it
// only in an effect — after the first route has already laid out. For an
// English user that flipped the document from RTL to LTR under a mounted
// schedule grid, resetting its scroll origin and leaving it at 00:00 instead
// of 08:00 (and painted one mirrored frame). DirectionSetter still owns every
// later language change.
document.documentElement.dir = savedLang === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = savedLang;

export default i18n;