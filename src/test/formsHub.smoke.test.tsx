import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// jsdom has no scrollIntoView / scrollTo — the page calls both on selection and submit.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
window.scrollTo = () => {};

vi.mock('../lib/supabase', () => {
  const result = { data: [], error: null };
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
    catch: (onR?: any) => Promise.resolve(result).catch(onR),
    finally: (onF?: any) => Promise.resolve(result).finally(onF),
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn(() => chain),
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'admin@nowopen.africa' },
    session: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

import Forms from '../pages/Forms';

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><Forms /></MemoryRouter>);

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const clickContinue = () => fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

const submitRemainingAcknowledgements = () => {
  fireEvent.click(screen.getByLabelText(/Privacy & data handling notice/));
  fireEvent.click(screen.getByLabelText(/Information I provide is accurate/));
  fireEvent.click(screen.getByLabelText(/I consent to NowOpen Africa/));
  fireEvent.click(screen.getByRole('button', { name: /Submit application/ }));
};

const submitPersonal = () => {
  fill('Full name', 'Ada Obi');
  fill('Email', 'ada@nowopen.africa');
  fill('Phone', '+234 800 000 0000');
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'Nigeria' } });
  clickContinue();
};

describe('Forms Hub smoke', () => {
  it('walks the employee journey from the selector to a submitted application', async () => {
    renderAt('/forms');

    // Hero and the nine relationship cards.
    expect(screen.getByText('Join the people building what comes next.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Employee/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Intern/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Partner/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Other/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Employee/ }));
    expect(screen.getByRole('heading', { name: 'Personal Information' })).toBeInTheDocument();
    submitPersonal();

    // Professional — nothing required.
    expect(screen.getByRole('heading', { name: 'Professional Information' })).toBeInTheDocument();
    clickContinue();

    // Employment interest — required department, role and work-style radios.
    expect(screen.getByRole('heading', { name: 'Employment Interest' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Desired department'), { target: { value: 'Creative & Brand' } });
    fill('Desired role', 'Senior Motion Designer');
    fireEvent.click(screen.getByLabelText('Employment type: Full-time'));
    fireEvent.click(screen.getByLabelText('Work style: Remote'));
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    clickContinue();

    // Documents — the CV upload becomes a metadata chip.
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('CV'), {
      target: { files: [new File(['data'], 'ada-cv.pdf', { type: 'application/pdf' })] },
    });
    expect(screen.getByText('ada-cv.pdf')).toBeInTheDocument();
    clickContinue();

    // Agreements — ack boxes are pre-journey, never binding.
    expect(screen.getByRole('heading', { name: 'Agreements' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Confidentiality / NDA'));
    fireEvent.click(screen.getByLabelText('Code of Conduct'));
    fireEvent.click(screen.getByLabelText('Privacy / data handling'));
    clickContinue();

    // Review shows the answers, then the final required acknowledgements.
    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Submit' })).toBeInTheDocument();
    submitRemainingAcknowledgements();

    expect(await screen.findByText('Application received')).toBeInTheDocument();
    expect(screen.getByText(/NOW-EMP-2026-[A-Z0-9]{4}/)).toBeInTheDocument();
    expect(screen.getByText('New — received')).toBeInTheDocument();
    expect(screen.getByText(/no legally binding relationship is created by submitting/)).toBeInTheDocument();
  });

  it('honours a preselected type and source, walking the intern journey', async () => {
    renderAt('/forms?type=intern&source=university');

    expect(screen.getByRole('heading', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Intern/ })).toHaveAttribute('aria-pressed', 'true');
    submitPersonal();

    expect(screen.getByRole('heading', { name: 'Education' })).toBeInTheDocument();
    fill('Institution', 'University of Lagos');
    fill('Course / field', 'Computer Science');
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Internship' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Preferred department'), { target: { value: 'Creative & Brand' } });
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('CV'), {
      target: { files: [new File(['data'], 'ada-internship-cv.pdf', { type: 'application/pdf' })] },
    });
    expect(screen.getByText('ada-internship-cv.pdf')).toBeInTheDocument();
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Questions' })).toBeInTheDocument();
    fill('What do you want to learn at NowOpen Africa?', 'Motion design on real client work');
    fill('What can you contribute?', 'Design, motion and social clips');
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Consent' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Internship terms'));
    fireEvent.click(screen.getByLabelText('Confidentiality'));
    fireEvent.click(screen.getByLabelText('Code of Conduct'));
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument();
    clickContinue();

    expect(screen.getByRole('heading', { name: 'Submit' })).toBeInTheDocument();
    submitRemainingAcknowledgements();

    expect(await screen.findByText('Application received')).toBeInTheDocument();
    expect(screen.getByText(/NOW-INT-2026-[A-Z0-9]{4}/)).toBeInTheDocument();
  });
});
