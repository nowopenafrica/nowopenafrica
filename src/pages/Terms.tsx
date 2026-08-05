import { Link } from 'react-router-dom';

// Plain-language starting-point terms for NowOpen Africa. Have these reviewed
// by a qualified lawyer for each market you operate in before launch.
export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Last updated: 29 July 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">1. About these terms</h2>
            <p>These terms govern your use of NowOpen Africa (the "Platform"), a directory and marketplace connecting African businesses, advertisers and creative professionals with customers. By creating an account or using the Platform you agree to these terms.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">2. Accounts</h2>
            <p>You must provide accurate information and keep your login credentials secure. You are responsible for activity on your account. Businesses are responsible for the accuracy of their listings, prices, availability and the goods or services they offer.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">3. Listings, bookings and payments</h2>
            <p>Bookings, orders and enquiries made through the Platform are agreements between the customer and the business. NowOpen Africa provides the tools to facilitate them and, where enabled, processes payments through third-party providers (such as Paystack). We are not a party to the underlying transaction and do not guarantee any product or service. Platform and booking fees, where applicable, are shown before checkout.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">4. Verification &amp; trust</h2>
            <p>Verification badges and trust scores reflect checks we have carried out at a point in time and are provided in good faith. They are not a guarantee. Always use your own judgement before transacting.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">5. Acceptable use</h2>
            <p>You agree not to post false, misleading, unlawful, infringing or harmful content, impersonate others, scrape the Platform, or attempt to disrupt its security or operation. We may suspend or remove content or accounts that breach these terms.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">6. Subscriptions</h2>
            <p>Paid plans renew for the period selected until cancelled. New business accounts may receive a free introductory trial; unless you choose a paid plan, your account moves to the free tier when the trial ends. You can change or cancel your plan from your dashboard.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">7. Liability</h2>
            <p>The Platform is provided "as is". To the maximum extent permitted by law, NowOpen Africa is not liable for indirect or consequential losses, or for the acts of businesses, advertisers or users on the Platform.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">8. Changes &amp; contact</h2>
            <p>We may update these terms from time to time; material changes will be notified on the Platform. Questions? Email <a href="mailto:hello@nowopenafrica.com" className="text-blue-600 dark:text-blue-400 hover:underline">hello@nowopenafrica.com</a>.</p>
          </section>
          <p className="text-xs text-gray-500 dark:text-gray-400">See also our <Link to="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</Link>.</p>
        </div>
      </div>
    </div>
  );
}
