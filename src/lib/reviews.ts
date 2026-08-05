// NowOpen Studio — Review & Reputation Manager.
//
// Tracks reviews, scores their sentiment and drafts an on-brand response for
// each one, so business owners can reply in seconds. Stored per business in
// localStorage; sample reviews are provided so the module is never empty.

import { Business } from '../types';

export interface Review {
  id: string;
  author: string;
  rating: number; // 1-5
  text: string;
  date: string;
  replied?: boolean;
  reply?: string;
}

export type Sentiment = 'positive' | 'neutral' | 'negative';

const POSITIVE = ['great', 'amazing', 'love', 'excellent', 'good', 'best', 'wonderful', 'delicious', 'friendly', 'recommend', 'fantastic', 'top', 'beautiful', 'awesome'];
const NEGATIVE = ['bad', 'worst', 'terrible', 'awful', 'rude', 'slow', 'late', 'disappointed', 'never', 'broke', 'poor', 'hate', 'dirty', 'unhappy'];

export function sentimentOf(text: string): Sentiment {
  const t = text.toLowerCase();
  let p = 0;
  let n = 0;
  for (const w of POSITIVE) if (t.includes(w)) p++;
  for (const w of NEGATIVE) if (t.includes(w)) n++;
  if (n > p) return 'negative';
  if (p > n) return 'positive';
  return 'neutral';
}

export function replyFor(business: Business, r: Review): string {
  const s = sentimentOf(r.text);
  const thanks = s === 'negative'
    ? `We're sorry your experience at ${business.name} didn't meet your expectations, ${r.author}.`
    : `Thanks for the ${s === 'positive' ? 'lovely' : 'honest'} review, ${r.author}!`;
  const body = s === 'negative'
    ? `Please reach out on ${business.phone || 'our NowOpen Africa profile'} so we can make it right — your feedback genuinely helps us improve.`
    : `We appreciate customers like you and hope to see you again soon at ${business.name}${business.location ? ` in ${business.location}` : ''}.`;
  return `${thanks} ${body}`;
}

export function reviewStats(reviews: Review[]) {
  const total = reviews.length;
  const avg = total ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10 : 0;
  const counts: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 };
  reviews.forEach((r) => counts[sentimentOf(r.text)]++);
  return { total, avg, ...counts, responded: reviews.filter((r) => r.replied).length };
}

export function reviewsKey(businessId: string): string {
  return `nowopen_reviews_${businessId}`;
}

export function loadReviews(businessId: string): Review[] {
  try {
    const raw = localStorage.getItem(reviewsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as Review[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReviews(businessId: string, reviews: Review[]): void {
  try { localStorage.setItem(reviewsKey(businessId), JSON.stringify(reviews)); } catch { /* ignore */ }
}

export function makeReview(data: Omit<Review, 'id' | 'date'>): Review {
  return {
    ...data,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString().slice(0, 10),
  };
}

// Sample reviews so the module demonstrates itself on a fresh profile.
export function sampleReviews(business: Business): Review[] {
  const cat = business.category || 'your business';
  const samples: [string, number, string][] = [
    ['Aminata', 5, `Absolutely loved the ${cat} experience at ${business.name}. Friendly staff and great value!`],
    ['Kwame', 4, `Good quality and honest pricing. Would recommend ${business.name} to anyone in ${business.location || 'the area'}.`],
    ['Chidinma', 5, `${business.name} went above and beyond. I will definitely be coming back.`],
    ['Tunde', 3, `Decent overall — service was a little slow on a busy day at ${business.name}, but the quality was good.`],
    ['Zainab', 5, `Best ${cat} around — ${business.name} is the top pick in ${business.location || 'the neighbourhood'}.`],
  ];
  return samples.map(([author, rating, text]) => makeReview({ author, rating, text }));
}
