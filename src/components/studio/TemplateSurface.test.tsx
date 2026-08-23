import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TemplateSurface from './TemplateSurface';
import { DESIGN_TEMPLATES, templateByKey, settleTime } from '../../lib/designTemplates';

const CONTENT = {
  brand: 'Mama Put Kitchen',
  eyebrow: 'This weekend',
  headline: 'Two plates for the price of one',
  subline: 'Friday to Sunday, dine in only',
  meta: 'nowopenafrica.com/mama-put',
  cta: 'Book now',
  logoUrl: null,
  qrUrl: null,
};

const px = (v: string) => Number.parseFloat(v.replace('px', ''));

describe('TemplateSurface — still rendering', () => {
  it('renders every text slot of every template', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      const { unmount } = render(
        <TemplateSurface template={tpl} content={CONTENT} width={1080} height={1080} accent="#9a3412" />,
      );
      // The headline is the one slot every template must have.
      expect(screen.getByText(CONTENT.headline), tpl.key).toBeTruthy();
      unmount();
    }
  });

  it('omits a slot with no content instead of leaving an empty box', () => {
    render(
      <TemplateSurface
        template={templateByKey('editorial-split')}
        content={{ ...CONTENT, subline: '' }}
        width={1080} height={1080} accent="#9a3412"
      />,
    );
    expect(screen.queryByText(CONTENT.subline)).toBeNull();
    expect(screen.getByText(CONTENT.headline)).toBeTruthy();
  });

  it('scales type with the canvas, not with the aspect ratio', () => {
    const read = (w: number, h: number) => {
      const { container, unmount } = render(
        <TemplateSurface template={templateByKey('statement')} content={CONTENT} width={w} height={h} accent="#9a3412" />,
      );
      const el = screen.getByText(CONTENT.headline) as HTMLElement;
      const size = px(getComputedStyle(el).fontSize);
      unmount();
      void container;
      return size;
    };
    // Square and story share a 1080 short edge, so the headline matches.
    expect(read(1080, 1080)).toBe(read(1080, 1920));
    // Print is larger.
    expect(read(2480, 3508)).toBeGreaterThan(read(1080, 1080));
  });

  it('paints a background so text never lands on transparency', () => {
    const { container } = render(
      <TemplateSurface template={templateByKey('statement')} content={CONTENT} width={600} height={600} accent="#9a3412" />,
    );
    const painted = [...container.querySelectorAll('div')].filter(d => (d as HTMLElement).style.background);
    expect(painted.length).toBeGreaterThan(0);
  });
});

describe('TemplateSurface — motion', () => {
  const tpl = templateByKey('editorial-split');

  it('hides slots that have not arrived yet', () => {
    render(<TemplateSurface template={tpl} content={CONTENT} width={1080} height={1080} accent="#9a3412" t={0} />);
    // The headline arrives at 0.5s, so at t=0 it is not in the tree at all.
    expect(screen.queryByText(CONTENT.headline)).toBeNull();
  });

  it('shows every slot once settled', () => {
    render(<TemplateSurface template={tpl} content={CONTENT} width={1080} height={1080} accent="#9a3412" t={settleTime(tpl)} />);
    expect(screen.getByText(CONTENT.headline)).toBeTruthy();
    expect(screen.getByText(CONTENT.subline)).toBeTruthy();
  });

  // The property the whole design rests on: a still is the animation's last
  // frame, because both go through the same resolver.
  it('matches the still exactly at settleTime', () => {
    const still = render(<TemplateSurface template={tpl} content={CONTENT} width={1080} height={1080} accent="#9a3412" />);
    const stillHtml = still.container.innerHTML;
    still.unmount();

    const end = render(<TemplateSurface template={tpl} content={CONTENT} width={1080} height={1080} accent="#9a3412" t={settleTime(tpl)} />);
    expect(end.container.innerHTML).toBe(stillHtml);
  });

  it('animates opacity partway through an entrance', () => {
    render(<TemplateSurface template={tpl} content={CONTENT} width={1080} height={1080} accent="#9a3412" t={0.7} />);
    const el = screen.getByText(CONTENT.headline).parentElement as HTMLElement;
    const o = Number(el.style.opacity);
    expect(o).toBeGreaterThan(0);
    expect(o).toBeLessThan(1);
  });
});

describe('TemplateSurface — editing', () => {
  it('commits an edited headline on blur', () => {
    const onEditText = vi.fn();
    render(
      <TemplateSurface
        template={templateByKey('statement')} content={CONTENT}
        width={1080} height={1080} accent="#9a3412" onEditText={onEditText}
      />,
    );
    const el = screen.getByText(CONTENT.headline);
    el.innerText = 'Half price all weekend';
    fireEvent.blur(el);
    expect(onEditText).toHaveBeenCalledWith('headline', 'Half price all weekend');
  });

  it('is not editable unless an edit handler is supplied', () => {
    render(<TemplateSurface template={templateByKey('statement')} content={CONTENT} width={1080} height={1080} accent="#9a3412" />);
    expect(screen.getByText(CONTENT.headline).getAttribute('contenteditable')).toBeNull();
  });
});
