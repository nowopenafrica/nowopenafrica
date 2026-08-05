import { Link } from 'react-router-dom';

// Plain-language starting-point privacy policy for NowOpen Africa. Have this
// reviewed against the data-protection law of each market you operate in
// (e.g. Nigeria's NDPA, Kenya's DPA, South Africa's POPIA) before launch.
export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Last updated: 29 July 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">1. Who we are</h2>
            <p>NowOpen Africa ("we") operates a directory and marketplace for African businesses, advertisers and creatives. This policy explains what personal data we collect, why, and your rights over it.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">2. What we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium">Account data</span> — name, email and/or phone number, password (stored hashed), account type.</li>
              <li><span className="font-medium">Business data</span> — listings, photos, prices, location and contact details you publish.</li>
              <li><span className="font-medium">Verification documents</span> — where you choose to get verified (ID, business registration), stored privately and used only for review.</li>
              <li><span className="font-medium">Transactions</span> — bookings, enquiries and payment records (card details are handled by our payment processor, not stored by us).</li>
              <li><span className="font-medium">Usage data</span> — device, approximate location and interaction data to run and improve the Platform.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">3. How we use it</h2>
            <p>To provide the Platform, show listings and search results, process bookings and payments, verify businesses, prevent fraud and abuse, provide support, and — with your consent — send you updates. We do not sell your personal data.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">4. Sharing</h2>
            <p>We share data with service providers who help us operate (hosting, payments, SMS/email, analytics) under appropriate safeguards, and where required by law. Business contact details you publish are visible to the public by design (you control what is shown from your dashboard).</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">5. Security &amp; retention</h2>
            <p>Data is encrypted in transit and at rest, access is restricted, and we keep personal data only as long as needed for the purposes above or as the law requires. No system is perfectly secure; please protect your login.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">6. Your rights</h2>
            <p>Subject to local law, you can access, correct, export or delete your data, and manage marketing and cookie preferences. To exercise these rights, email <a href="mailto:hello@nowopenafrica.com" className="text-blue-600 dark:text-blue-400 hover:underline">hello@nowopenafrica.com</a>. You may also delete your account from your dashboard.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">7. Cookies</h2>
            <p>We use essential cookies to keep you signed in and remember preferences (theme, currency). We ask before using any non-essential cookies. You can change your choice at any time.</p>
          </section>
          <p className="text-xs text-gray-500 dark:text-gray-400">See also our <Link to="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">Terms of Service</Link>.</p>
        </div>
      </div>
    </div>
  );
}
