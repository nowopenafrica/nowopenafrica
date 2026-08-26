import { Languages } from 'lucide-react';

import { useI18n } from '../contexts/I18nContext';
import { LOCALES, Locale } from '../lib/i18n';

interface LanguageSelectorProps {
  className?: string;
}

// Sits beside the currency selector, which is the honest place for it: the two
// answer the same question — "show me this in terms I read" — and someone
// looking for one will look for the other in the same corner.
//
// Options are labelled with each language's endonym ("Français", not "French").
// Somebody who needs the French option is, by definition, not reliably reading
// the English word for it.
export default function LanguageSelector({ className = '' }: LanguageSelectorProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label
      className={`relative inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 ${className}`}
      title={t('lang.change')}
    >
      <Languages size={15} className="flex-shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('lang.label')}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="appearance-none bg-transparent pr-1 py-1 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
      >
        {LOCALES.map((l) => (
          <option
            key={l.code}
            value={l.code}
            // lang on the option so a screen reader pronounces "Français" as
            // French while the rest of the menu is read in the page language.
            lang={l.code}
            className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {l.endonym}
          </option>
        ))}
      </select>
    </label>
  );
}
