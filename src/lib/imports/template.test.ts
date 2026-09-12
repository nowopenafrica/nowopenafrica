import { describe, it, expect } from 'vitest';

import { importTemplateCsv, importTemplateFilename } from './template';
import { autoMap, applyMapping, DATASET_FIELDS, missingRequired } from './mapping';
import { parseCsv } from '../../components/admin/ImportCenter';

/**
 * The downloadable import template.
 *
 * `import_batches.column_mapping` exists because the first guess at a
 * spreadsheet's headers is expected to be wrong. A template removes the guess
 * for anybody starting from scratch, which is the cheapest available fix for
 * the most expensive failure the Import Center has: a shifted column creating
 * thousands of wrong businesses in a minute.
 *
 * It carries its data dictionary in the same file, as `#` rows, because a
 * separate document is a document nobody opens.
 */

describe('the template is exactly what the importer understands', () => {
  it('has a header for every field autoMap knows', () => {
    /*
     * Generated from DATASET_FIELDS rather than typed beside it. Two copies of
     * the field list drift the moment a field is added, leaving an admin
     * filling in a column the importer no longer maps.
     */
    const csv = importTemplateCsv('businesses');
    const { headers } = parseCsv(csv);
    expect(headers).toEqual(DATASET_FIELDS.businesses.map((f) => f.field));
  });

  it('maps onto itself with nothing left over', () => {
    // The real proof: feed the template back through the mapper.
    const csv = importTemplateCsv('businesses');
    const { headers } = parseCsv(csv);
    const mapping = autoMap(headers, 'businesses');
    expect(missingRequired(mapping, 'businesses')).toEqual([]);
  });

  it('covers every dataset, not just businesses', () => {
    for (const dataset of Object.keys(DATASET_FIELDS) as (keyof typeof DATASET_FIELDS)[]) {
      const csv = importTemplateCsv(dataset);
      expect(csv.length, `${dataset} template is empty`).toBeGreaterThan(50);
      expect(importTemplateFilename(dataset)).toMatch(/\.csv$/);
    }
  });
});

describe('the template cannot import itself', () => {
  it('yields exactly one data row — the example', () => {
    /*
     * THE BUG THIS CAUGHT. I wrote the template asserting that rows beginning
     * with `#` are skipped by the parser. They were not: parseCsv only
     * dropped rows where EVERY cell was blank, so the data dictionary would
     * have imported as businesses named "# FIELD  REQUIRED  NOTES" — the
     * template manufacturing junk listings out of its own instructions.
     *
     * Writing the test is what found it, because the claim was in a comment
     * and comments are not executed.
     */
    const csv = importTemplateCsv('businesses');
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it('has no row whose name starts with a hash', () => {
    const { rows } = parseCsv(importTemplateCsv('businesses'));
    for (const r of rows) {
      expect(Object.values(r).join(' ')).not.toMatch(/^#/);
    }
  });

  it('the one row it does yield is an obvious example, not plausible data', () => {
    /*
     * If an admin uploads the template unedited, it must create something
     * nobody mistakes for a real business — and it must still be a VALID row,
     * so the failure is "that is the example" rather than a validation error
     * that sends them hunting for a formatting problem.
     */
    const { headers, rows } = parseCsv(importTemplateCsv('businesses'));
    const mapped = applyMapping(rows[0], autoMap(headers, 'businesses'));
    expect(mapped.business_name ?? mapped.name).toMatch(/Zanzibar Coffee/);
  });

  it('still parses a hash that is not in the first column', () => {
    // `#1 Best Suya` is a real kind of business name.
    const csv = 'business_name,category\n"#1 Best Suya",Restaurant\n';
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].business_name).toBe('#1 Best Suya');
  });
});

describe('the dictionary says what an admin cannot infer', () => {
  const csv = importTemplateCsv('businesses');

  it('explains the multi-image separator', () => {
    // Nothing about a `gallery_urls` header tells you it takes several values.
    expect(csv).toMatch(/Separate with a pipe/);
  });

  it('warns that http images are upgraded and page links refused', () => {
    expect(csv).toMatch(/https only/);
    expect(csv).toMatch(/not at a page|rather than an image file/);
  });

  it('says an existing business is updated, not duplicated', () => {
    /*
     * The single most reassuring thing an admin can read before uploading a
     * second file from the same source.
     */
    expect(csv).toMatch(/is NOT created again/);
    expect(csv).toMatch(/phone, then website domain, then name \+ city/);
  });

  it('says an empty cell does not delete', () => {
    // The difference between an import that enriches and one that strips.
    expect(csv).toMatch(/never deletes/);
    expect(csv).toMatch(/this file does not say/);
  });

  it('says phone formats are normalised, so nobody reformats a column by hand', () => {
    expect(csv).toMatch(/Normalised to \+234/);
  });
});
