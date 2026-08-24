import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AtSign, Lock, User } from 'lucide-react';
import PasswordToggle from '../components/PasswordToggle';
import { useAuth, isEmail, normalizePhone } from '../contexts/AuthContext';
import PhoneOtpForm from '../components/auth/PhoneOtpForm';
import toast from 'react-hot-toast';
import { applySeo } from '../lib/seo';

export default function Register() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'business' | 'media_service'>('business');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  /**
   * Which fields the person has finished with.
   *
   * Errors only appear once a field has been left (or submit is attempted), so
   * nobody is told their email is invalid while they are still on the first
   * character of it.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    return applySeo({
      title: 'Create an Account — NowOpen Africa',
      description: 'Create your NowOpen Africa account to list a business, publish creative services or book advertising.',
      path: '/register',
      robots: 'noindex, nofollow',
    });
  }, []);

  /**
   * Field-level errors, recomputed each render.
   *
   * These used to be three `toast.error` calls fired on submit. A toast is not
   * attached to the field it is about, does not survive long enough to act on,
   * and leaves nothing for a screen reader to associate with the input — so
   * the only way to learn a password was too short was to submit and watch a
   * message disappear. Each rule now renders next to its own field and is
   * wired up with aria-invalid / aria-describedby.
   */
  const errors: Record<string, string> = {};
  const id = identifier.trim();
  if (!id) {
    errors.identifier = 'Enter your email address or phone number.';
  } else if (!isEmail(id)) {
    // Not an email, so it has to be a usable phone number. Without this the
    // form accepted anything: normalizePhone('asdf') returns just "+", which
    // went to the auth provider and came back as an error nobody could act on.
    const digits = id.replace(/[^\d]/g, '');
    if (digits.length < 7) {
      errors.identifier = 'That does not look like an email address or a phone number.';
    } else if (!id.trim().startsWith('+')) {
      errors.identifier = 'Include the country code, starting with + (e.g. +234 801 234 5678).';
    }
  }
  if (!password) {
    errors.password = 'Choose a password.';
  } else if (password.length < 8) {
    errors.password = 'Use at least 8 characters.';
  } else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = 'Include both letters and numbers.';
  }
  if (confirmPassword && password !== confirmPassword) {
    errors.confirmPassword = 'Both passwords must match.';
  } else if (!confirmPassword) {
    errors.confirmPassword = 'Re-enter your password.';
  }

  const showError = (field: string) =>
    (touched[field] || submitAttempted) && errors[field] ? errors[field] : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    if (Object.keys(errors).length > 0) {
      // Send focus to the first problem rather than announcing it and leaving
      // the person to hunt for which field it meant.
      const first = ['identifier', 'password', 'confirmPassword'].find((f) => errors[f]);
      if (first) document.getElementById(first)?.focus();
      return;
    }

    setLoading(true);

    try {
      const usingEmail = isEmail(identifier);
      await signUp(identifier, password, role);
      if (usingEmail) {
        toast.success('Account created! Please check your email to verify.');
        navigate('/login');
      } else {
        // Phone signup — show the SMS code step instead of leaving the page.
        toast.success('We sent a verification code to your phone.');
        setPendingPhone(normalizePhone(identifier));
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 dark:from-gray-900 dark:to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {pendingPhone ? 'Verify your phone' : 'Create your account'}
          </h1>
          {!pendingPhone && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="inline-flex items-center min-h-[44px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                Sign in
              </Link>
            </p>
          )}
        </div>

        {pendingPhone ? (
          <PhoneOtpForm phone={pendingPhone} onVerified={() => navigate('/dashboard')} />
        ) : (
        <form
          className="mt-8 space-y-6"
          // Our own messages are the single source of truth. The browser's
          // built-in bubbles fired first on the `required` attributes, so they
          // blocked the submit, focused whichever field they picked, and our
          // specific messages never rendered — the person saw a generic native
          // tooltip that vanished on the next click. `required` stays on each
          // input for semantics and assistive tech.
          noValidate
          onSubmit={handleSubmit}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email or phone number
              </label>
              <div className="mt-1 relative">
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  maxLength={120}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, identifier: true }))}
                  aria-invalid={showError('identifier') ? true : undefined}
                  aria-describedby={showError('identifier') ? 'identifier-error' : 'identifier-hint'}
                  className={`appearance-none block w-full px-3 min-h-[44px] pl-10 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 ${
                    showError('identifier')
                      ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  placeholder="you@email.com or +234 801 234 5678"
                />
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              </div>
              {showError('identifier') ? (
                <p id="identifier-error" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{showError('identifier')}</p>
              ) : (
                <p id="identifier-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">Sign up with an email or a phone number — include the country code for phone (e.g. +234).</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  aria-invalid={showError('password') ? true : undefined}
                  aria-describedby={showError('password') ? 'password-error' : 'password-hint'}
                  className={`appearance-none block w-full px-3 min-h-[44px] pl-10 pr-12 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 ${
                    showError('password')
                      ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  placeholder="Create a password"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
              </div>
              {showError('password') ? (
                <p id="password-error" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{showError('password')}</p>
              ) : (
                <p id="password-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">At least 8 characters, with letters and numbers.</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
                  aria-invalid={showError('confirmPassword') ? true : undefined}
                  aria-describedby={showError('confirmPassword') ? 'confirm-error' : undefined}
                  className={`appearance-none block w-full px-3 min-h-[44px] pl-10 pr-12 border rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 ${
                    showError('confirmPassword')
                      ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  placeholder="Confirm your password"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} field="password confirmation" />
              </div>
              {showError('confirmPassword') && (
                <p id="confirm-error" role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{showError('confirmPassword')}</p>
              )}
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Account Type
              </label>
              <div className="mt-1 relative">
                <select
                  id="role"
                  name="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'business' | 'media_service')}
                  className="appearance-none block w-full px-3 min-h-[44px] pl-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="business">Business</option>
                  <option value="media_service">Media Service</option>
                </select>
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex items-center justify-center min-h-[48px] px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
