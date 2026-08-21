import { Eye, EyeOff } from 'lucide-react';

// The reveal button that sits inside a password field.
//
// One component rather than the same twenty lines copied per form. It existed
// three times already — on Login, Register and ResetPassword — each with a
// 20px icon and no real hit area, and was missing entirely from the auth modal
// and the confirm-password fields, which is where a typo actually costs you.
//
// The button is 44x44 (the platform's touch-target standard, in px so the
// site-wide mobile font-size reduction cannot shrink it), while the icon stays
// visually small. It is type="button" so it never submits the form, and
// aria-hidden on the icon leaves the accessible name to the label alone.
//
// `field` distinguishes several toggles on one form: "Show password" twice in
// the same dialog tells a screen-reader user nothing about which field.

export default function PasswordToggle({
  shown,
  onToggle,
  field = 'password',
  className = '',
}: {
  shown: boolean;
  onToggle: () => void;
  field?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${shown ? 'Hide' : 'Show'} ${field}`}
      aria-pressed={shown}
      title={`${shown ? 'Hide' : 'Show'} ${field}`}
      className={`absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-[44px] h-[44px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg ${className}`}
    >
      {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
    </button>
  );
}
