import { describe, expect, it } from 'vitest';
import { formatInvokeError } from './client';

describe('formatInvokeError', () => {
  it('surfaces an HTTP status for FunctionsHttpError-shaped SDK errors', () => {
    expect(
      formatInvokeError({
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 401, url: 'https://x/functions/v1/ai-command' },
      }),
    ).toBe('FunctionsHttpError (HTTP 401): Edge Function returned a non-2xx status code');
  });

  it('keeps FunctionsFetchError transport wording and omits status', () => {
    expect(
      formatInvokeError({
        name: 'FunctionsFetchError',
        message: 'Failed to send a request to the Edge Function',
        context: { status: 0 } as unknown as { status?: number },
      }),
    ).toBe('FunctionsFetchError: Failed to send a request to the Edge Function');
  });

  it('reads statusCode when context is absent', () => {
    expect(
      formatInvokeError({ name: 'FunctionsHttpError', message: 'non-2xx', statusCode: 403 }),
    ).toBe('FunctionsHttpError (HTTP 403): non-2xx');
  });

  it('falls back to a default name and message for uknown input', () => {
    expect(formatInvokeError(null)).toBe('FunctionsError: OpenAI Code Center call failed.');
    expect(formatInvokeError('boom')).toBe('FunctionsError: OpenAI Code Center call failed.');
  });
});