import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// Shown after a phone signup — the user enters the 6-digit SMS code Supabase
// sent to confirm the number. On success verifyPhoneOtp creates a session and
// onVerified() fires (caller decides where to go next).
export default function PhoneOtpForm({
  phone,
  onVerified,
  compact = false,
}: {
  phone: string;
  onVerified: () => void;
  compact?: boolean;
}) {
  const { verifyPhoneOtp, resendPhoneOtp } = useAuth();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) {
      toast.error('Enter the code from the SMS');
      return;
    }
    setVerifying(true);
    try {
      await verifyPhoneOtp(phone, code);
      toast.success('Phone verified!');
      onVerified();
    } catch (err: any) {
      toast.error(err.message || 'That code was not valid — try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendPhoneOtp(phone);
      toast.success('A new code has been sent.');
    } catch (err: any) {
      toast.error(err.message || 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleVerify} className={compact ? 'space-y-4' : 'mt-8 space-y-6'}>
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          We sent a verification code to <span className="font-semibold text-gray-900 dark:text-white">{phone}</span>.
          Enter it below to finish creating your account.
        </p>
      </div>

      <div>
        <label htmlFor="otp" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Verification code</label>
        <input
          id="otp"
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="mt-1 block w-full text-center tracking-[0.5em] text-lg px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="••••••"
        />
      </div>

      <button
        type="submit"
        disabled={verifying}
        className="w-full flex justify-center items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
      >
        {verifying && <Loader2 size={16} className="animate-spin" />}
        {verifying ? 'Verifying…' : 'Verify & continue'}
      </button>

      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        Didn't get a code?{' '}
        <button type="button" onClick={handleResend} disabled={resending} className="font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
          {resending ? 'Sending…' : 'Resend'}
        </button>
      </p>
    </form>
  );
}
