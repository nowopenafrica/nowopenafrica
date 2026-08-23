import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OpeningHoursEditor from '../components/dashboard/OpeningHoursEditor';
import { parseOpeningHours } from '../lib/openingHours';

/** The most recent onChange payload. (`Array#at` needs a newer lib target.) */
const lastCall = (fn: { mock: { calls: any[][] } }): string =>
  fn.mock.calls[fn.mock.calls.length - 1][0];

describe('OpeningHoursEditor', () => {
  it('shows every day of the week', () => {
    render(<OpeningHoursEditor value="" onChange={vi.fn()} />);
    for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }
  });

  it('loads stored hours back into the right days', () => {
    render(<OpeningHoursEditor value="Mon–Fri: 9AM–6PM · Sat: 10AM–4PM" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Monday opening time')).toHaveValue('09:00');
    expect(screen.getByLabelText('Monday closing time')).toHaveValue('18:00');
    expect(screen.getByLabelText('Saturday opening time')).toHaveValue('10:00');
    // Sunday was not in the text, so it stays closed and has no time inputs.
    expect(screen.queryByLabelText('Sunday opening time')).not.toBeInTheDocument();
  });

  it('emits text the parser can read when a day is opened', () => {
    const onChange = vi.fn();
    render(<OpeningHoursEditor value="" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Monday'));
    const emitted = lastCall(onChange);
    const parsed = parseOpeningHours(emitted);
    expect(parsed).not.toBeNull();
    expect(parsed!.days[1].open).toBe(9 * 60);
  });

  it('emits 24/7 that the parser flags as always open', () => {
    const onChange = vi.fn();
    render(<OpeningHoursEditor value="" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Open 24/7'));
    expect(parseOpeningHours(lastCall(onChange))!.alwaysOpen).toBe(true);
  });

  it('collapses the day rows and explains itself when 24/7 is on', () => {
    render(<OpeningHoursEditor value="Open 24/7" onChange={vi.fn()} />);
    expect(screen.getByText(/shows as open at all times/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Monday opening time')).not.toBeInTheDocument();
  });

  it('warns about legacy prose it cannot turn into a badge, without discarding it', () => {
    // Real stored value from the seed data that parseOpeningHours returns null for.
    render(<OpeningHoursEditor value="By appointment · Mon–Sat" onChange={vi.fn()} />);
    expect(screen.getByText(/can't show as an automatic/)).toBeInTheDocument();
    // Shown twice on purpose: in the warning, and in the "customers will see"
    // preview. The point is that it is never silently dropped.
    expect(screen.getAllByText(/By appointment · Mon–Sat/).length).toBeGreaterThanOrEqual(1);
  });

  it('copies the first open day across the whole week', () => {
    const onChange = vi.fn();
    render(<OpeningHoursEditor value="Mon: 8AM–2PM" onChange={onChange} />);
    fireEvent.click(screen.getByText(/Apply to every day/));
    const parsed = parseOpeningHours(lastCall(onChange))!;
    expect(parsed.days.every((d) => d.open === 8 * 60 && d.close === 14 * 60)).toBe(true);
  });
});
