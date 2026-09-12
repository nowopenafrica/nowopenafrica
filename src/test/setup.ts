// Extends Vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.)
// for every test file.
import '@testing-library/jest-dom/vitest';

// jsdom never shipped createObjectURL/revokeObjectURL, but the review stages
// (photo AND reel) turn their blobs into object URLs before they hit the DOM.
// A dummy blob: URL is enough for the testbed — nothing fetches it.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => `blob:mock-${Math.random().toString(36).slice(2)}`;
  URL.revokeObjectURL = () => {};
}
