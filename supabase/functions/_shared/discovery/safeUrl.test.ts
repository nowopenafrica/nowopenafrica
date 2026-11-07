/**
 * The SSRF guard, ported with its edge cases. A sample of the browser-side
 * safeUrl.test.ts, tightened to the shapes the website adapter sees.
 */

import { describe, expect, it } from 'vitest';
import { checkFetchUrl, FETCH_CONTRACT } from './safeUrl.ts';

describe('checkFetchUrl', () => {
  it('parses an ordinary business website', () => {
    const v = checkFetchUrl('https://www.zanzibarcoffee.ng/about?utm=x');
    expect(v.safe).toBe(true);
    expect(v.url).toBe('https://www.zanzibarcoffee.ng/about?utm=x');
    expect(v.reason).toBeNull();
  });

  it('refuses non-http schemes', () => {
    expect(checkFetchUrl('file:///etc/passwd').reason).toBe('scheme');
    expect(checkFetchUrl('ftp://example.com/').reason).toBe('scheme');
  });

  it('refuses credentials in the URL', () => {
    expect(checkFetchUrl('https://user:pass@internal.example/').reason).toBe('credentials');
  });

  it('refuses ports a website is not served from', () => {
    expect(checkFetchUrl('https://example.com:5432/').reason).toBe('port');
    expect(checkFetchUrl('https://example.com:6379/').reason).toBe('port');
    expect(checkFetchUrl('https://example.com:8443/').safe).toBe(true);
  });

  it('refuses loopback, metadata and private ranges', () => {
    expect(checkFetchUrl('http://127.0.0.1/').reason).toBe('loopback');
    expect(checkFetchUrl('http://0.0.0.0/').reason).toBe('loopback');
    expect(checkFetchUrl('http://169.254.169.254/latest/meta-data/').reason).toBe('metadata');
    expect(checkFetchUrl('http://10.0.0.1/').reason).toBe('private_ip');
    expect(checkFetchUrl('http://172.16.0.1/').reason).toBe('private_ip');
    expect(checkFetchUrl('http://192.168.1.1/').reason).toBe('private_ip');
  });

  it('refuses IPv4-mapped IPv6 worlds, decimal and hex', () => {
    expect(checkFetchUrl('http://[::ffff:127.0.0.1]/').reason).toBe('loopback');
    expect(checkFetchUrl('http://[::ffff:7f00:1]/').reason).toBe('loopback');
    expect(checkFetchUrl('http://[::ffff:a8d4:c8a]/').safe).toBe(true);
  });

  it('refuses internal names', () => {
    expect(checkFetchUrl('http://localhost/').reason).toBe('internal_name');
    expect(checkFetchUrl('http://db.internal/').reason).toBe('internal_name');
    expect(checkFetchUrl('http://metadata.google.internal/').reason).toBe('internal_name');
  });

  it('refuses a host with no dot', () => {
    expect(checkFetchUrl('http://intranet/').reason).toBe('no_public_suffix');
  });

  it('permits a public IP literal', () => {
    expect(checkFetchUrl('http://8.8.8.8/').safe).toBe(true);
  });

  it('states the fetch contract that binds the caller', () => {
    expect(FETCH_CONTRACT.resolveAndRecheck).toBe(true);
    expect(FETCH_CONTRACT.manualRedirects).toBe(true);
    expect(FETCH_CONTRACT.maxRedirects).toBeLessThanOrEqual(3);
    expect(FETCH_CONTRACT.timeoutMs).toBeLessThanOrEqual(15_000);
    expect(FETCH_CONTRACT.maxBytes).toBeLessThanOrEqual(5_000_000);
    expect(FETCH_CONTRACT.acceptTypes).toContain('text/html');
  });
});