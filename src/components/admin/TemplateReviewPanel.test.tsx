import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const update = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: (patch: unknown) => {
        update(patch);
        return { eq: async () => ({ error: null }) };
      },
    })),
  },
}));

import TemplateReviewPanel from './TemplateReviewPanel';
import { DESIGN_TEMPLATES } from '../../lib/designTemplates';
import { RUBRIC } from '../../lib/create/templateReview';
import type { TemplateRow } from '../../lib/create/templateCatalogue';

const template = DESIGN_TEMPLATES[0];
const row: TemplateRow = {
  id: 'row-1', key: template.key, label: template.label, description: null, category: 'social',
  styles: [], industries: [], tags: [], document: template, editability: 'full', source_format: 'json',
  format: null, preview_url: null, status: 'in_review', published_at: null, created_at: '2026-11-17T00:00:00Z',
};

describe('TemplateReviewPanel', () => {
  it('saves only a complete review, with the automatic findings and C10 recorded', async () => {
    const onSaved = vi.fn();
    render(<TemplateReviewPanel row={row} template={template} siblings={DESIGN_TEMPLATES} onSaved={onSaved} onClose={() => {}} />);

    const save = screen.getByRole('button', { name: /Save review/ });
    expect(save).toBeDisabled();

    for (const r of RUBRIC) fireEvent.change(screen.getByLabelText(r.label), { target: { value: String(r.max) } });
    expect(screen.getByText(/100 of 100/)).toBeInTheDocument();
    expect(save).toBeDisabled(); // no decision yet

    fireEvent.click(screen.getByLabelText('Approve'));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const patch = update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.review_decision).toBe('approve');
    expect(patch.review_criticals).toContain('C10');
    // The score is the database's to compute: the browser never sends one.
    expect(patch).not.toHaveProperty('review_score');
    expect(patch).not.toHaveProperty('reviewed_by');
  });

  it('saves product, direction and demo copy into the document first, and holds the review until then', async () => {
    update.mockClear();
    const onSaved = vi.fn();
    const doc = { ...template, key: 'upload-y' } as Record<string, unknown>;
    delete doc.direction;
    const upload = { ...template, key: 'upload-y', direction: undefined };
    render(<TemplateReviewPanel row={{ ...row, key: 'upload-y', document: doc }} template={upload} siblings={DESIGN_TEMPLATES} onSaved={onSaved} onClose={() => {}} />);

    for (const r of RUBRIC) fireEvent.change(screen.getByLabelText(r.label), { target: { value: String(r.max) } });
    fireEvent.click(screen.getByLabelText('Approve'));
    expect(screen.getByRole('button', { name: /Save review/ })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'instagram-post' } });
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'bold' } });
    fireEvent.change(screen.getByLabelText('Demo Headline'), { target: { value: '  Now open  ' } });
    // The findings a review records must be those of what is stored.
    expect(screen.getByRole('button', { name: /Save review/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Save details/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const patch = update.mock.calls[0][0] as { document: Record<string, unknown> };
    expect(patch.document.subcategory).toBe('instagram-post');
    expect(patch.document.direction).toBe('bold');
    expect(patch.document.sample).toEqual({ headline: 'Now open' });
    expect(patch).not.toHaveProperty('review_lines');
  });

  it('refuses a line over its maximum', () => {
    render(<TemplateReviewPanel row={row} template={template} siblings={DESIGN_TEMPLATES} onSaved={() => {}} onClose={() => {}} />);
    for (const r of RUBRIC) fireEvent.change(screen.getByLabelText(r.label), { target: { value: String(r.max) } });
    fireEvent.change(screen.getByLabelText('Originality'), { target: { value: '16' } });
    fireEvent.click(screen.getByLabelText('Approve'));
    expect(screen.getByRole('button', { name: /Save review/ })).toBeDisabled();
    expect(screen.getByText('Originality must be 0 to 15')).toBeInTheDocument();
  });
});
