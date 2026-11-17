import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import BriefPanel from './BriefPanel';
import { readBrief } from '../../lib/create/brief';

describe('BriefPanel', () => {
  it('shows what was read and marks an assumption as an assumption', () => {
    render(<BriefPanel brief={readBrief('Billboard for high-end Lagos real estate')} onAnswer={() => {}} />);
    const panel = screen.getByTestId('brief-panel');
    expect(within(panel).getAllByText(/Real estate and property/).length).toBeGreaterThan(0);
    expect(within(panel).getByText('Lagos')).toBeTruthy();
    expect(within(panel).getByText('Luxury')).toBeTruthy();
    const assumed = panel.querySelectorAll('[data-source="default"]');
    expect(assumed.length).toBeGreaterThan(0);
    for (const el of assumed) expect(el.textContent).toMatch(/^assumed/);
    expect(panel.querySelector('[data-source="typed"]')?.textContent).toBe('your words');
  });

  it('uses the NowOpen face for its own headings', () => {
    render(<BriefPanel brief={readBrief('flyer for my bakery')} onAnswer={() => {}} />);
    expect(screen.getByRole('heading', { level: 2 }).className).toContain('font-coolvetica');
  });

  it('says what Create cannot make, and never shows a product label for a fashion label', () => {
    render(<BriefPanel brief={readBrief('Brand identity for a premium African fashion label')} onAnswer={() => {}} />);
    expect(screen.getByTestId('brief-limits').textContent).toMatch(/cannot draw an original logo/i);
    expect(screen.queryByText(/Product label/)).toBeNull();
    expect(screen.getByText('A full set of matching pieces')).toBeTruthy();
  });

  it('asks at most three questions and passes an answer back', () => {
    const onAnswer = vi.fn();
    render(<BriefPanel brief={readBrief('help')} onAnswer={onAnswer} />);
    expect(screen.getAllByTestId(/^brief-question-/)).toHaveLength(3);
    const q = screen.getByTestId('brief-question-industry');
    const add = within(q).getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(within(q).getByRole('combobox'), { target: { value: 'cafe-bakery' } });
    fireEvent.click(add);
    expect(onAnswer).toHaveBeenCalledWith('industry', 'cafe-bakery');
  });

  it('lists what the piece must carry, for the customer to supply', () => {
    render(<BriefPanel brief={readBrief('Instagram post for a contemporary restaurant opening')} onAnswer={() => {}} />);
    expect(screen.getByText('A finished piece will need')).toBeTruthy();
    expect(screen.getByText(/You supply these/)).toBeTruthy();
    expect(screen.getByText(/Opening date or hours/)).toBeTruthy();
  });
});
