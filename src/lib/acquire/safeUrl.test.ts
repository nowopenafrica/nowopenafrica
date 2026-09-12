import { describe, it, expect } from 'vitest';

import { checkFetchUrl, assertSafeToFetch, FETCH_CONTRACT } from './safeUrl';

/**
 * §38: SSRF protection, before anything fetches.
 *
 * Measured 2026-09-08: no code in this repository fetches a URL that came from
 * the database — every `fetch()` targets a fixed provider endpoint. So there
 * is no SSRF surface today, and the moment the first source adapter exists
 * there is a large one.
 *
 * These are the strings an attacker actually sends, not a happy path with one
 * `localhost` case bolted on.
 */

const rejects = (url: string, reason: string) => {
  const v = checkFetchUrl(url);
  expect(v.safe, `${url} must be refused`).toBe(false);
  expect(v.reason, url).toBe(reason);
};

describe('the server itself', () => {
  it('refuses loopback in every spelling', () => {
    rejects('http://127.0.0.1/', 'loopback');
    /*
     * The WHATWG URL parser EXPANDS IPv4 shorthand, so `127.1` arrives as
     * `127.0.0.1` and is caught as loopback. I expected no_public_suffix and
     * was wrong — worth pinning, because it means the parser is doing part of
     * this job and a future refactor that hand-rolls host parsing would lose
     * it silently.
     */
    rejects('http://127.1/', 'loopback');
    rejects('http://2130706433/', 'loopback');        // 127.0.0.1 as an integer
    rejects('http://0.0.0.0/', 'loopback');
    rejects('http://[::1]/', 'loopback');
    rejects('http://localhost/', 'internal_name');
    rejects('http://LOCALHOST/admin', 'internal_name');
    rejects('http://api.localhost/', 'internal_name');
  });

  it('refuses 127.x beyond .0.1', () => {
    // The whole /8 is the host, not just the famous address.
    rejects('http://127.99.42.7/', 'loopback');
  });
});

describe('cloud metadata — the one that ends the company', () => {
  it('refuses 169.254.169.254', () => {
    /*
     * Returns instance credentials on AWS, GCP and Azure. One successful
     * fetch of this is a full compromise, which is why it is both an
     * explicit blocked host and inside the link-local rejection.
     */
    rejects('http://169.254.169.254/latest/meta-data/', 'blocked_host');
  });

  it('refuses the ECS task-credentials address', () => {
    rejects('http://169.254.170.2/v2/credentials/', 'blocked_host');
  });

  it('refuses metadata by name, with no IP literal at all', () => {
    rejects('http://metadata.google.internal/computeMetadata/v1/', 'internal_name');
    rejects('http://metadata/computeMetadata/', 'internal_name');
    rejects('http://metadata.googleapis.com/', 'blocked_host');
  });

  it('refuses the rest of link-local', () => {
    rejects('http://169.254.1.1/', 'metadata');
  });
});

describe('private networks', () => {
  for (const [url, reason] of [
    ['http://10.0.0.1/', 'private_ip'],
    ['http://10.255.255.255/', 'private_ip'],
    ['http://172.16.0.1/', 'private_ip'],
    ['http://172.31.255.1/', 'private_ip'],
    ['http://192.168.1.1/', 'private_ip'],
    ['http://100.64.0.1/', 'private_ip'],        // CGNAT
    ['http://224.0.0.1/', 'private_ip'],         // multicast
    ['http://255.255.255.255/', 'private_ip'],
  ] as const) {
    it(`refuses ${url}`, () => rejects(url, reason));
  }

  it('permits the public addresses next door to a private range', () => {
    // 172.15 and 172.32 are public; refusing them would break real sources.
    expect(checkFetchUrl('http://172.15.0.1/').safe).toBe(true);
    expect(checkFetchUrl('http://172.32.0.1/').safe).toBe(true);
    expect(checkFetchUrl('http://11.0.0.1/').safe).toBe(true);
  });
});

describe('IPv6 smuggling', () => {
  it('refuses unique-local and link-local', () => {
    rejects('http://[fc00::1]/', 'private_ip');
    rejects('http://[fd12:3456::1]/', 'private_ip');
    rejects('http://[fe80::1]/', 'link_local');
  });

  it('refuses an IPv4 address wearing an IPv6 host', () => {
    /*
     * `::ffff:127.0.0.1` is loopback expressed as IPv6. A v4-only check that
     * did not unwrap this would pass it straight through.
     */
    rejects('http://[::ffff:127.0.0.1]/', 'loopback');
    rejects('http://[::ffff:169.254.169.254]/', 'metadata');
    rejects('http://[::ffff:10.0.0.1]/', 'private_ip');
    // The hex form is what `new URL()` actually produces from the above.
    rejects('http://[::ffff:7f00:1]/', 'loopback');
    rejects('http://[::ffff:a9fe:a9fe]/', 'metadata');
  });
});

describe('schemes and credentials', () => {
  it('refuses everything but http and https', () => {
    for (const u of ['file:///etc/passwd', 'gopher://x.com/', 'ftp://x.com/', 'dict://x:11211/', 'data:text/html,x']) {
      expect(checkFetchUrl(u).safe, u).toBe(false);
    }
    expect(checkFetchUrl('file:///etc/passwd').reason).toBe('scheme');
  });

  it('refuses credentials in the URL', () => {
    /*
     * `http://expected.com@evil.com/` is read by a human as expected.com and
     * by a URL parser as evil.com. Refusing credentials outright removes the
     * whole class rather than trying to out-parse the attacker.
     */
    rejects('http://user:pass@example.com/', 'credentials');
    rejects('http://example.com@169.254.169.254/', 'credentials');
  });
});

describe('ports', () => {
  it('refuses ports that are really a port scan', () => {
    for (const p of [22, 3306, 5432, 6379, 9200, 11211, 27017]) {
      rejects(`http://example.com:${p}/`, 'port');
    }
  });

  it('permits the ports a website is actually served from', () => {
    for (const u of ['http://example.com/', 'https://example.com/', 'http://example.com:80/', 'https://example.com:443/', 'https://example.com:8443/']) {
      expect(checkFetchUrl(u).safe, u).toBe(true);
    }
  });
});

describe('hostnames that are not websites', () => {
  it('refuses a bare name with no dot', () => {
    // Resolving it would depend on the server's search domains — which is how
    // an internal host gets reached without ever being named.
    rejects('http://intranet/', 'no_public_suffix');
    rejects('http://db/', 'no_public_suffix');
  });

  it('refuses container and cluster names', () => {
    rejects('http://my-svc.svc.cluster.local/', 'internal_name');
    rejects('http://kubernetes.default/', 'internal_name');
    rejects('http://printer.lan/', 'internal_name');
    rejects('http://nas.home/', 'internal_name');
  });

  it('refuses a trailing-dot FQDN', () => {
    // `example.com.` bypasses suffix matching in some stacks.
    rejects('http://example.com./', 'no_public_suffix');
  });
});

describe('what it lets through', () => {
  it('permits a public address wearing an IPv6 host', () => {
      /*
       * The over-blocking half of the same bug: before the hex form was
       * decoded, ::ffff:8.8.8.8 was refused as private_ip. Safe, but wrong —
       * and the kind of wrong that makes an operator distrust the guard.
       */
      expect(checkFetchUrl('http://[::ffff:808:808]/').safe).toBe(true);
  });

  it('permits an ordinary business website', () => {
    const v = checkFetchUrl('https://www.zanzibarcoffee.ng/about?utm=x');
    expect(v.safe).toBe(true);
    expect(v.url).toBe('https://www.zanzibarcoffee.ng/about?utm=x');
  });

  it('normalises rather than merely approving', () => {
    // The caller fetches the returned value, so it must be the parsed form.
    expect(checkFetchUrl('HTTPS://Example.COM/Path').url).toBe('https://example.com/Path');
  });
});

describe('the reason is reported, not just the refusal', () => {
  it('explains why, for the review queue', () => {
    /*
     * "Could not fetch" tells an operator nothing about whether the source is
     * broken or hostile, and those need different responses.
     */
    const v = checkFetchUrl('http://169.254.169.254/');
    expect(v.detail).toMatch(/metadata endpoint|refused outright/i);
    expect(v.detail.length).toBeGreaterThan(20);
  });

  it('assertSafeToFetch names the reason in the error', () => {
    expect(() => assertSafeToFetch('http://10.0.0.1/')).toThrow(/private network/i);
    expect(assertSafeToFetch('https://example.com/')).toBe('https://example.com/');
  });
});

describe('the contract the fetch layer must honour', () => {
  it('declares the two holes a URL parser cannot close', () => {
    /*
     * DNS rebinding and redirects are real attacks this module cannot see.
     * Declaring them is deliberate: a guard that looks complete and is not is
     * worse than none, because it stops anybody looking for the hole.
     */
    expect(FETCH_CONTRACT.resolveAndRecheck).toBe(true);
    expect(FETCH_CONTRACT.manualRedirects).toBe(true);
    expect(FETCH_CONTRACT.maxRedirects).toBeLessThanOrEqual(3);
  });

  it('bounds time and size, so a hostile page cannot exhaust a worker', () => {
    expect(FETCH_CONTRACT.timeoutMs).toBeLessThanOrEqual(15_000);
    expect(FETCH_CONTRACT.maxBytes).toBeLessThanOrEqual(5_000_000);
  });

  it('parses only page-shaped content types', () => {
    expect(FETCH_CONTRACT.acceptTypes).toContain('text/html');
    expect(FETCH_CONTRACT.acceptTypes.some((t) => t.includes('javascript'))).toBe(false);
  });
});
