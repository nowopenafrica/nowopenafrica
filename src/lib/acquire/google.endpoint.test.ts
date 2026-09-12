import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import handler from '../../../api/acquire/google';
import { GOOGLE_TEXT_SEARCH } from './google';

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (code: number) => FakeRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
}

function makeFakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    headers: {},
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  return res;
}

const call = async (req: { method?: string; query: Record<string, string | string[] | undefined> }) => {
  const res = makeFakeRes();
  await handler(req, res);
  return res;
};

const place = (over: { phone?: string; types?: string[] } = {}) => ({
  displayName: { text: 'Taste Lagos' },
  formattedAddress: '10 Martin Street, Lagos',
  addressComponents: [
    { longText: 'Lagos', shortText: 'Lagos', types: ['locality'] },
    { longText: 'Nigeria', shortText: 'NG', types: ['country'] },
  ],
  nationalPhoneNumber: over.phone ?? '+234 800 123 4567',
  types: over.types ?? ['restaurant'],
  plusPlaceId: 'ChIJ0000PLACE0001',
  googleMapsUri: 'https://maps.google.com/?cid=1',
});

const saveKey = process.env.GOOGLE_PLACES_API_KEY;

beforeEach(() => {
  delete process.env.GOOGLE_PLACES_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (saveKey) process.env.GOOGLE_PLACES_API_KEY = saveKey;
  else delete process.env.GOOGLE_PLACES_API_KEY;
});

describe('api/acquire/google', () => {
  it('returns 503 with the plain message while no key is set — and never calls Places', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ method: 'GET', query: { place: 'Lagos' } });

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toBe('Google Places API key is not configured.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves a keyed search via the Places API, honouring the field mask and attribution', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ places: [place()] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await call({ method: 'GET', query: { place: 'Lagos', limit: '5' } });

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      source: string;
      count: number;
      rowsRead: number;
      query: { place: string };
      candidates: Array<{ confident: boolean }>;
    };
    expect(body.source).toBe('google');
    expect(body.query.place).toBe('Lagos');
    expect(body.count).toBe(1);
    expect(body.rowsRead).toBe(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GOOGLE_TEXT_SEARCH);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('test-key');
    expect(headers['X-Goog-FieldMask']).toContain('places.googleMapsUri');
    expect(JSON.parse(init.body as string)).toMatchObject({ textQuery: 'Lagos' });
  });

  it('drops places without a phone when contact-only, and does not page past the limit', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [
          place(),
          place({ phone: undefined }),
          place({ phone: undefined }),
          place({ phone: undefined }),
          place({ phone: undefined }),
        ],
        nextPageToken: 'next',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await call({ method: 'GET', query: { place: 'Lagos', limit: '1', contact: '1' } });

    expect(res.statusCode).toBe(200);
    const body = res.body as { count: number; candidates: Array<{ phone: string | null }> };
    expect(body.count).toBe(1);
    expect(body.candidates[0].phone).toBe('+234 800 123 4567');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('answers 405 to anything but GET', async () => {
    const res = await call({ method: 'POST', query: {} });
    expect(res.statusCode).toBe(405);
    expect((res.body as { error: string }).error).toBe('GET only');
  });
});