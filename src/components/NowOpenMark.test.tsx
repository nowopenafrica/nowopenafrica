import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NowOpenMark from './NowOpenMark';

// Smoke test that also proves the jsdom + Testing Library + jest-dom wiring.
describe('<NowOpenMark />', () => {
  it('renders without crashing at a given size', () => {
    const { container } = render(<NowOpenMark size={24} />);
    expect(container.firstChild).toBeTruthy();
  });
});
