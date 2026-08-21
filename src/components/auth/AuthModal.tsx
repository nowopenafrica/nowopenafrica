import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X, Github } from 'lucide-react';
import PasswordToggle from '../PasswordToggle';
import { useAuth, isEmail, normalizePhone } from '../../contexts/AuthContext';
import PhoneOtpForm from './PhoneOtpForm';

interface AuthModalProps {
  onClose: () => void;
}

// Turn raw Supabase auth errors into something a customer can act on. The
// common one here: the Phone provider isn't enabled in Supabase (needs an SMS
// provider), so a phone attempt returns "Phone logins are disabled".
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('phone logins are disabled') || m.includes('phone_provider_disabled') || m.includes('phone provider')) {
    return 'Phone sign-in isn’t available yet — please use your email address to continue.';
  }
  if (m.includes('invalid login credentials')) {
    return 'That email/phone and password don’t match. Please try again.';
  }
  return message;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const { signUp, signIn, signInWithGoogle, signInWithGitHub } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(identifier, password);
        if (!isEmail(identifier)) {
          // Phone signup — swap to the OTP step inside the modal.
          toast.success('We sent a verification code to your phone.');
          setPendingPhone(normalizePhone(identifier));
          return;
        }
        // With email confirmation on there's no session yet — closing silently
        // would look like the signup did nothing.
        toast.success('Account created! Check your email to confirm before signing in.', { duration: 6000 });
      } else {
        await signIn(identifier, password);
        toast.success('Welcome back!');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? friendlyAuthError(err.message) : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const goForgotPassword = () => {
    onClose();
    navigate('/forgot-password');
  };

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    setError('');
    setLoading(true);

    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithGitHub();
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Social login failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {pendingPhone ? 'Verify your phone' : isSignUp ? 'Create Account' : 'Sign In'}
          </h2>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {pendingPhone ? (
          <div className="p-6">
            <PhoneOtpForm phone={pendingPhone} compact onVerified={onClose} />
          </div>
        ) : (
        <>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email or phone number
            </label>
            <input
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@email.com or +234 801 234 5678"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 pr-11 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
            </div>
            {!isSignUp && (
              <div className="mt-1.5 text-right">
                <button
                  type="button"
                  onClick={goForgotPassword}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm"
          >
            {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400 text-center mb-3">Or continue with</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleSocialLogin('google')}
              disabled={loading}
              className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm font-medium disabled:opacity-50"
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => handleSocialLogin('github')}
              disabled={loading}
              className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Github size={16} />
              GitHub
            </button>
          </div>
        </div>

        <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
