import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { Review, sentimentOf, replyFor, reviewStats, makeReview, sampleReviews } from './reviews';

const biz = { id: '1', name: 'Meat Club', category: 'Restaurant', location: 'Lagos', phone: '+234 800 123 4567' } as unknown as Business;

function review(over: Partial<Review> = {}): Review {
  return { id: 'r1', author: 'Aminata', rating: 5, text: 'Great place!', date: '2026-08-01', ...over };
}

describe('review sentiment', () => {
  it('detects positive, negative and neutral', () => {
    expect(sentimentOf('Absolutely loved it, excellent service, very friendly staff.')).toBe('positive');
    expect(sentimentOf('Worst experience, rude staff and terrible food.')).toBe('negative');
    expect(sentimentOf('It was okay, average visit.')).toBe('neutral');
  });
});

describe('review replies', () => {
  it('thanks positive reviews by name and business', () => {
    const reply = replyFor(biz, review({ text: 'Absolutely loved it!' }));
    expect(reply).toContain('Aminata');
    expect(reply).toContain('Meat Club');
    expect(reply).not.toMatch(/sorry/i);
  });

  it('apologises and offers a fix for negative reviews', () => {
    const reply = replyFor(biz, review({ rating: 1, text: 'Terrible experience, rude staff.' }));
    expect(reply).toContain('sorry');
    expect(reply).toContain('make it right');
  });
});

describe('review stats', () => {
  it('computes average, sentiment counts and responses', () => {
    const stats = reviewStats([
      review({ text: 'Loved it, excellent!' }),
      review({ text: 'Great food, friendly team.' }),
      review({ text: 'Terrible, never again.' }),
      review({ text: 'Bad, broke my order.' }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.avg).toBe(5);
    expect(stats.positive).toBe(2);
    expect(stats.negative).toBe(2);
    expect(stats.neutral).toBe(0);
    expect(stats.responded).toBe(0);
  });
});

describe('review factory', () => {
  it('adds id and date to new reviews', () => {
    const r = makeReview({ author: 'Kwame', rating: 4, text: 'Good value.' });
    expect(r.id.length).toBeGreaterThan(5);
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('samples five plausible reviews for a business', () => {
    const samples = sampleReviews(biz);
    expect(samples.length).toBe(5);
    for (const s of samples) {
      expect(s.rating).toBeGreaterThanOrEqual(1);
      expect(s.rating).toBeLessThanOrEqual(5);
      expect(s.text).toContain('Meat Club');
    }
  });
});
