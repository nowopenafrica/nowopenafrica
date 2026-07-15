// Shared business category list — used by the add-business form and anywhere
// categories are offered as options. Grouped for a nicer dropdown.

export const BUSINESS_CATEGORY_GROUPS: { group: string; items: string[] }[] = [
  {
    group: 'Food & Hospitality',
    items: ['Restaurant', 'Fast Food', 'Café & Bakery', 'Bar & Lounge', 'Catering', 'Hotel & Lodging', 'Event Planning'],
  },
  {
    group: 'Retail & Commerce',
    items: ['Retail Store', 'Supermarket', 'Fashion & Apparel', 'Electronics', 'Jewelry & Accessories', 'Furniture & Home', 'Online Store / E-commerce'],
  },
  {
    group: 'Technology & Media',
    items: ['Software & IT', 'Telecommunications', 'Digital Marketing', 'Media & Publishing', 'Photography & Video', 'Web & App Development'],
  },
  {
    group: 'Health & Wellness',
    items: ['Hospital & Clinic', 'Pharmacy', 'Dental Care', 'Fitness & Gym', 'Spa & Beauty', 'Wellness & Therapy'],
  },
  {
    group: 'Professional Services',
    items: ['Legal Services', 'Accounting & Tax', 'Consulting', 'Financial Services', 'Insurance', 'Real Estate', 'Recruitment & HR'],
  },
  {
    group: 'Trades & Industry',
    items: ['Construction', 'Manufacturing', 'Automotive', 'Logistics & Transport', 'Agriculture', 'Energy & Utilities', 'Cleaning Services'],
  },
  {
    group: 'Education & Community',
    items: ['School & Education', 'Training & Tutoring', 'Childcare', 'Non-profit & NGO', 'Religious Organization'],
  },
  {
    group: 'Arts & Entertainment',
    items: ['Entertainment', 'Music & Nightlife', 'Sports & Recreation', 'Art & Design', 'Travel & Tourism'],
  },
];

// Flat list (e.g. for validation or filters)
export const BUSINESS_CATEGORIES: string[] = BUSINESS_CATEGORY_GROUPS.flatMap(g => g.items);
