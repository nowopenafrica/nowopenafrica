// Demo data for the Mobile Money / Money Transfer agent operating system.
// Shown only for the curated agent spotlight. Reuses business_services
// (service_category = service type), so no migration is needed.

export interface SampleMoneyService {
  id: string;
  name: string;
  description: string;
  price: string;   // fee / rate note
  service_category: string;   // service type
}

export const SAMPLE_MONEY_SERVICES: SampleMoneyService[] = [
  { id: 'mon_1', name: 'Cash withdrawal (POS)', description: 'Withdraw from any bank card or mobile wallet — instant, no bank queue.', price: 'From 1% fee', service_category: 'Cash-out' },
  { id: 'mon_2', name: 'Cash deposit / transfer', description: 'Deposit cash to any Nigerian bank account or send to a wallet.', price: 'From ₦100', service_category: 'Transfer' },
  { id: 'mon_3', name: 'International remittance', description: 'Receive Western Union, MoneyGram and Ria — paid out in Naira instantly.', price: 'Live FX rate', service_category: 'Remittance' },
  { id: 'mon_4', name: 'Airtime & data', description: 'Top up all networks — MTN, Airtel, Glo, 9mobile — at a discount.', price: 'Up to 4% off', service_category: 'Airtime & Data' },
  { id: 'mon_5', name: 'Bill payments', description: 'Pay electricity (PHCN), cable TV (DStv/GOtv), water and betting wallets.', price: 'From ₦50', service_category: 'Bills' },
  { id: 'mon_6', name: 'Open a wallet / account', description: 'Register a mobile-money wallet or a bank account with BVN in minutes.', price: 'Free', service_category: 'Account' },
];

// Supported providers / rails (sample-only badges).
export const MONEY_PROVIDERS = ['MTN MoMo', 'Airtel Money', 'OPay', 'Moniepoint', 'Palmpay', 'Western Union'];

export const MONEY_SPOTLIGHTS: Record<string, any> = {
  business_66: {
    id: 'business_66',
    username: 'swiftpay-money-agent',
    name: 'SwiftPay Money Agent',
    category: 'Money Transfer / Mobile Money Agent',
    description:
      'Your neighbourhood money point — cash in/out, transfers, airtime, bills and international remittance across all major wallets and banks.',
    location: 'Oshodi, Lagos',
    phone: '+234 805 220 1174',
    website: '',
    email: 'swiftpay@example.com',
    opening_hours: 'Mon–Sun: 7AM–9PM',
    image_url:
      'https://images.pexels.com/photos/4386370/pexels-photo-4386370.jpeg?auto=compress&cs=tinysrgb&w=800',
    rating: 4.6,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
