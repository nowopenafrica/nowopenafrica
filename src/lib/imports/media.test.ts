import { describe, it, expect } from 'vitest';

import { checkImageUrl, checkGalleryUrls, mediaProblemMessage } from './media';

/**
 * Image URLs arriving in a spreadsheet.
 *
 * `logo_url` and `cover_image_url` were mapped by the importer and never
 * checked — the wrong way round for a value that ends up in an `<img src>` on
 * a public profile. None of the failure modes are loud:
 *
 *   javascript:  a script NowOpen would publish on somebody's behalf
 *   http://      blocked as mixed content; shows as a broken picture, which
 *                reads as NowOpen being broken rather than the file being wrong
 *   a page URL   loads nothing at all
 */

describe('what is refused outright', () => {
  for (const scheme of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:msgbox', 'file:///etc/passwd', 'blob:https://x.com/abc']) {
    it(`refuses ${scheme.split(':')[0]}:`, () => {
      const { url, problem } = checkImageUrl(scheme);
      expect(url).toBeNull();
      expect(problem).toBe('unsafe_scheme');
    });
  }

  it('uses an allowlist, so an unforeseen scheme is refused too', () => {
    /*
     * The point of allowlisting: it is also right about the schemes nobody
     * thought to block.
     */
    expect(checkImageUrl('gopher://old.example/img').url).toBeNull();
    expect(checkImageUrl('//evil.example/x.png').url).toBeNull();
  });

  it('refuses a link to a page or document', () => {
    for (const u of ['https://x.com/gallery.html', 'https://x.com/brochure.pdf', 'https://x.com/list.csv']) {
      expect(checkImageUrl(u).problem).toBe('not_an_image');
    }
  });

  it('refuses something that is not a URL at all', () => {
    expect(checkImageUrl('see attached').problem).toBe('not_a_url');
    expect(checkImageUrl('https://localhost/x.png').problem).toBe('not_a_url');
  });
});

describe('what is accepted', () => {
  it('takes an https image', () => {
    const { url, problem } = checkImageUrl('https://cdn.example.com/logo.png');
    expect(problem).toBeNull();
    expect(url).toBe('https://cdn.example.com/logo.png');
  });

  it('takes an extensionless CDN url', () => {
    /*
     * Most real image hosting — Supabase storage, Cloudinary, imgix — serves
     * from paths with no extension. Requiring `.png` would reject the majority
     * of legitimate links.
     */
    expect(checkImageUrl('https://res.cloudinary.com/demo/image/upload/v1/sample').problem).toBeNull();
  });

  it('upgrades http rather than discarding it, and says so', () => {
    /*
     * Almost every http image link in a directory export is simply old, and
     * the same file is served over https. Publishing it as http would be
     * blocked on a secure page, so the choice is upgrade or discard —
     * upgrading is recoverable, discarding is not.
     */
    const { url, problem } = checkImageUrl('http://cdn.example.com/logo.png');
    expect(url).toBe('https://cdn.example.com/logo.png');
    expect(problem).toBe('insecure');
  });

  it('does not upgrade an http link to a non-image', () => {
    expect(checkImageUrl('http://x.com/page.html').url).toBeNull();
  });

  it('treats an empty cell as empty, not as an error', () => {
    // A blank column is the normal case; flagging it would bury the real
    // problems under thousands of non-issues.
    expect(checkImageUrl('').problem).toBe('empty');
    expect(checkImageUrl(null).problem).toBe('empty');
  });
});

describe('several images in one cell', () => {
  it('splits on pipes, semicolons and newlines', () => {
    const { urls } = checkGalleryUrls('https://a.com/1.jpg|https://b.com/2.jpg;https://c.com/3.jpg');
    expect(urls).toHaveLength(3);
  });

  it('splits on a comma only when a URL follows', () => {
    /*
     * The case a naive split breaks: `?w=800,h=600` is an ordinary query
     * string, and cutting it produces two unusable fragments from one good
     * image.
     */
    const { urls } = checkGalleryUrls('https://img.example/p.jpg?w=800,h=600');
    expect(urls).toEqual(['https://img.example/p.jpg?w=800,h=600']);
  });

  it('still splits a comma-separated list of urls', () => {
    const { urls } = checkGalleryUrls('https://a.com/1.jpg, https://b.com/2.jpg');
    expect(urls).toHaveLength(2);
  });

  it('reports each rejected value so the admin knows which to fix', () => {
    const { urls, rejected } = checkGalleryUrls('https://a.com/1.jpg|javascript:x|https://b.com/2.jpg');
    expect(urls).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].problem).toBe('unsafe_scheme');
  });

  it('drops a repeat of the same image', () => {
    // The same URL twice in one cell is a copy-paste artefact, not a gallery.
    const { urls } = checkGalleryUrls('https://a.com/1.jpg|https://a.com/1.jpg');
    expect(urls).toEqual(['https://a.com/1.jpg']);
  });

  it('caps how many it will take', () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://a.com/${i}.jpg`).join('|');
    expect(checkGalleryUrls(many).urls).toHaveLength(12);
  });
});

describe('the messages name the actual problem', () => {
  it('does not say "not usable" for a refused script', () => {
    // "Logo is not usable" gives an admin nothing to act on; naming the
    // reason tells them whether to fix the file or the source.
    const msg = mediaProblemMessage('logo_url', 'unsafe_scheme', 'javascript:alert(1)');
    expect(msg).toMatch(/refused/i);
    expect(msg).toMatch(/https/);
  });

  it('explains the http upgrade rather than reporting a failure', () => {
    const msg = mediaProblemMessage('logo_url', 'insecure', 'http://x/y.png');
    expect(msg).toMatch(/upgraded/i);
    expect(msg).toMatch(/blocked on a secure page/i);
  });
});
