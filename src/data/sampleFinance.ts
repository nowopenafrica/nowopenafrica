// Demo data for the Finance operating system. Shown only for the curated
// financial-services spotlight. Reuses business_services (service_category =
// product type), so no migration is needed.

export interface SampleFinancialProduct {
  id: string;
  name: string;
  description: string;
  price: string;   // rate / fee summary
  service_category: string;   // product type
}

export const SAMPLE_FINANCIAL: SampleFinancialProduct[] = [
  { id: 'fin_1', name: 'SME Business Loan', description: 'Working-capital loans for registered businesses.', price: 'From 4% / month', service_category: 'Loans' },
  { id: 'fin_2', name: 'Salary Advance', description: 'Quick advance against your monthly salary.', price: 'From 5% / month', service_category: 'Loans' },
  { id: 'fin_3', name: 'Asset Finance', description: 'Finance vehicles, equipment and machinery.', price: 'From 3.5% / month', service_category: 'Loans' },
  { id: 'fin_4', name: 'High-Yield Savings', description: 'Grow your money with competitive interest.', price: 'Up to 15% / year', service_category: 'Savings' },
  { id: 'fin_5', name: 'Fixed Deposit', description: 'Lock funds for a fixed term at a higher rate.', price: 'Up to 18% / year', service_category: 'Investment' },
  { id: 'fin_6', name: 'Health Insurance (HMO)', description: 'Affordable health cover for you and family.', price: 'From ₦25,000 / year', service_category: 'Insurance' },
  { id: 'fin_7', name: 'Motor Insurance', description: 'Third-party and comprehensive vehicle cover.', price: 'From ₦15,000 / year', service_category: 'Insurance' },
];

export const FINANCE_SPOTLIGHTS: Record<string, any> = {
  business_54: {
    id: 'business_54',
    username: 'zenith-microfinance',
    name: 'Zenith MicroFinance',
    category: 'Financial Services',
    description:
      'Loans, savings, investments and insurance for individuals and small businesses. Apply online or speak to a financial advisor.',
    location: 'Ikeja, Lagos',
    phone: '+234 800 936 4844',
    website: 'https://zenithmfb.example.com',
    email: 'hello@zenithmfb.example.com',
    opening_hours: 'Mon–Fri: 8AM–5PM',
    image_url: 'https://images.pexels.com/photos/210574/pexels-photo-210574.jpeg?auto=compress&cs=tinysrgb&w=1000',
    rating: 4.6,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
