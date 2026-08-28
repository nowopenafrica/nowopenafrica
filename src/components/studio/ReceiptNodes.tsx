import { forwardRef } from 'react';

import { Business } from '../../types';
import {
  formatMoney, receiptItemTotal, receiptTotals, nightsBetween,
  type Receipt, type ReceiptTotals,
} from '../../lib/receipts';
import { profileUrl } from '../../lib/studio';

/**
 * The printable receipts.
 *
 * NO `dark:` VARIANTS ANYWHERE IN THIS FILE, deliberately.
 *
 * Every other surface in the app follows the owner's theme. A receipt must not:
 * it is exported and printed, and a business owner working at night would
 * otherwise hand their customer — or their printer — a black rectangle. The
 * document is white because paper is white.
 *
 * Nothing here uses backdrop-filter either. It is the one common CSS effect
 * html-to-image cannot rasterise (it has no backdrop to sample inside the
 * serialised SVG), so an element relying on it exports as a flat panel.
 */

interface NodeProps {
  business: Business;
  receipt: Receipt;
  accent: string;
  /** Optional QR to the live profile, so a paper slip leads back online. */
  qr?: string;
}

const money = (n: number, r: Receipt) => formatMoney(n, r.currency);

const issuedLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** Rows every layout shows, in the order money is actually reckoned. */
function TotalsRows({ t, r, muted = '#64748b' }: { t: ReceiptTotals; r: Receipt; muted?: string }) {
  return (
    <>
      <Row label="Subtotal" value={money(t.subtotal, r)} muted={muted} />
      {t.discount > 0 && <Row label={`Discount (${r.discountPct}%)`} value={`− ${money(t.discount, r)}`} muted={muted} />}
      {t.tax > 0 && <Row label={`Tax (${r.taxPct}%)`} value={money(t.tax, r)} muted={muted} />}
    </>
  );
}

function Row({ label, value, muted = '#64748b', bold }: { label: string; value: string; muted?: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5" style={{ fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? '#0f172a' : muted }}>{label}</span>
      <span style={{ color: '#0f172a' }}>{value}</span>
    </div>
  );
}

/**
 * The line that closes the transaction.
 *
 * A part payment is shown as an outstanding balance rather than folded into the
 * total, because a receipt that reads "PAID" over an unpaid balance is a claim
 * the business cannot support later.
 */
function Settlement({ t, r, accent }: { t: ReceiptTotals; r: Receipt; accent: string }) {
  return (
    <>
      <Row label="Paid" value={`${money(r.amountPaid, r)} · ${r.method}`} />
      {t.change > 0 && <Row label="Change" value={money(t.change, r)} />}
      {t.outstanding > 0 && (
        <div className="mt-2 rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: '#fef2f2', color: '#b91c1c' }}>
          Balance due: {money(t.outstanding, r)}
        </div>
      )}
      {t.outstanding === 0 && (
        <div className="mt-2 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold tracking-wide"
          style={{ background: `${accent}1a`, color: accent }}>
          PAID IN FULL
        </div>
      )}
    </>
  );
}

function BrandMark({ business, accent, compact }: { business: Business; accent: string; compact?: boolean }) {
  const size = compact ? 36 : 48;
  return business.logo_url ? (
    <img
      src={business.logo_url}
      alt=""
      crossOrigin="anonymous"
      style={{ width: size, height: size }}
      className="rounded-lg object-cover flex-shrink-0"
    />
  ) : (
    <span
      className="rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, background: accent, fontSize: compact ? 16 : 20 }}
    >
      {business.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Footer({ business, qr, note }: { business: Business; qr?: string; note?: string }) {
  return (
    <div className="mt-5 pt-4 flex items-end justify-between gap-4" style={{ borderTop: '1px solid #e2e8f0' }}>
      <div className="min-w-0">
        {note && <p className="text-[11px] mb-1" style={{ color: '#475569' }}>{note}</p>}
        <p className="text-[11px]" style={{ color: '#94a3b8' }}>
          {profileUrl(business).replace(/^https?:\/\//, '')}
        </p>
      </div>
      {qr && <img src={qr} alt="" className="w-16 h-16 flex-shrink-0" />}
    </div>
  );
}

// --- 1. Till roll -------------------------------------------------------------

export const ThermalReceiptNode = forwardRef<HTMLDivElement, NodeProps>(
  ({ business, receipt: r, accent, qr }, ref) => {
    const t = receiptTotals(r.items, r.taxPct, r.discountPct, r.amountPaid);
    // Monospace and centred, because that is what a counter printer produces
    // and what a customer recognises as a till slip.
    const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    return (
      <div
        ref={ref}
        style={{ width: 380, maxWidth: '100%', background: '#fff', fontFamily: mono, color: '#0f172a' }}
        className="px-5 py-6"
      >
        <div className="text-center">
          <div className="flex justify-center mb-2"><BrandMark business={business} accent={accent} compact /></div>
          <p className="text-[15px] font-bold uppercase tracking-wide">{business.name}</p>
          {business.location && <p className="text-[11px]" style={{ color: '#64748b' }}>{business.location}</p>}
          {business.phone && <p className="text-[11px]" style={{ color: '#64748b' }}>{business.phone}</p>}
        </div>

        <div className="my-3 text-[11px]" style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '8px 0', color: '#475569' }}>
          <div className="flex justify-between"><span>{r.number}</span><span>{issuedLabel(r.issuedAt)}</span></div>
          {r.servedBy && <div className="flex justify-between"><span>Served by</span><span>{r.servedBy}</span></div>}
          {r.customerName && <div className="flex justify-between"><span>Customer</span><span>{r.customerName}</span></div>}
        </div>

        <div className="text-[12px]">
          {r.items.filter((i) => i.description.trim() || receiptItemTotal(i) > 0).map((i) => (
            <div key={i.id} className="py-1">
              <div className="flex justify-between gap-3">
                <span className="min-w-0" style={{ wordBreak: 'break-word' }}>{i.description || '—'}</span>
                <span className="flex-shrink-0">{money(receiptItemTotal(i), r)}</span>
              </div>
              <div className="text-[10px]" style={{ color: '#94a3b8' }}>{i.qty} × {money(i.unitPrice, r)}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 text-[12px]" style={{ borderTop: '1px dashed #cbd5e1' }}>
          <TotalsRows t={t} r={r} />
          <div className="mt-1 pt-2 flex justify-between text-[16px] font-bold" style={{ borderTop: '1px solid #0f172a' }}>
            <span>TOTAL</span><span>{money(t.total, r)}</span>
          </div>
          <div className="mt-2"><Settlement t={t} r={r} accent={accent} /></div>
        </div>

        {r.notes && <p className="mt-3 text-[11px] text-center" style={{ color: '#475569' }}>{r.notes}</p>}

        <div className="mt-4 text-center">
          {qr && <img src={qr} alt="" className="w-20 h-20 mx-auto mb-2" />}
          <p className="text-[10px]" style={{ color: '#94a3b8' }}>{profileUrl(business).replace(/^https?:\/\//, '')}</p>
          <p className="text-[11px] mt-1">Thank you — please come again</p>
        </div>
      </div>
    );
  },
);
ThermalReceiptNode.displayName = 'ThermalReceiptNode';

// --- Shared frame for the wide layouts ----------------------------------------

function SheetHeader({ business, r, accent, title }: { business: Business; r: Receipt; accent: string; title: string }) {
  return (
    <div className="px-7 py-5 flex items-start justify-between gap-4" style={{ background: accent, color: '#fff' }}>
      <div className="flex items-center gap-3 min-w-0">
        <BrandMark business={business} accent={accent} />
        <div className="min-w-0">
          <p className="text-[17px] font-bold leading-tight truncate">{business.name}</p>
          <p className="text-[11px] opacity-80 truncate">
            {[business.location, business.phone].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-90">{title}</p>
        <p className="text-[13px] font-bold">{r.number}</p>
        <p className="text-[10px] opacity-80">{issuedLabel(r.issuedAt)}</p>
      </div>
    </div>
  );
}

function ItemsTable({ r, accent }: { r: Receipt; accent: string }) {
  const rows = r.items.filter((i) => i.description.trim() || receiptItemTotal(i) > 0);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }} className="text-[12px]">
      <thead>
        <tr style={{ borderBottom: `2px solid ${accent}` }}>
          <th style={{ textAlign: 'left', padding: '6px 0', color: '#475569', fontWeight: 700 }}>Description</th>
          <th style={{ textAlign: 'right', padding: '6px 0', color: '#475569', fontWeight: 700, width: 56 }}>Qty</th>
          <th style={{ textAlign: 'right', padding: '6px 0', color: '#475569', fontWeight: 700, width: 100 }}>Unit</th>
          <th style={{ textAlign: 'right', padding: '6px 0', color: '#475569', fontWeight: 700, width: 110 }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '7px 0', color: '#0f172a' }}>{i.description || '—'}</td>
            <td style={{ padding: '7px 0', textAlign: 'right', color: '#475569' }}>{i.qty}</td>
            <td style={{ padding: '7px 0', textAlign: 'right', color: '#475569' }}>{money(i.unitPrice, r)}</td>
            <td style={{ padding: '7px 0', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>{money(receiptItemTotal(i), r)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={4} style={{ padding: '14px 0', color: '#94a3b8' }}>No items yet.</td></tr>
        )}
      </tbody>
    </table>
  );
}

function TotalsPanel({ t, r, accent }: { t: ReceiptTotals; r: Receipt; accent: string }) {
  return (
    <div className="mt-4 flex justify-end">
      <div style={{ width: 280 }} className="text-[12px]">
        <TotalsRows t={t} r={r} />
        <div className="mt-2 pt-2 flex items-baseline justify-between text-[16px] font-bold" style={{ borderTop: `2px solid ${accent}` }}>
          <span>Total</span><span>{money(t.total, r)}</span>
        </div>
        <div className="mt-2"><Settlement t={t} r={r} accent={accent} /></div>
      </div>
    </div>
  );
}

const sheetStyle = { width: 640, maxWidth: '100%', background: '#fff', color: '#0f172a' } as const;

// --- 2. Sales receipt ---------------------------------------------------------

export const RetailReceiptNode = forwardRef<HTMLDivElement, NodeProps>(
  ({ business, receipt: r, accent, qr }, ref) => {
    const t = receiptTotals(r.items, r.taxPct, r.discountPct, r.amountPaid);
    return (
      <div ref={ref} style={sheetStyle} className="rounded-2xl overflow-hidden" >
        <SheetHeader business={business} r={r} accent={accent} title="Sales receipt" />
        <div className="px-7 py-6">
          {(r.customerName || r.servedBy) && (
            <div className="flex gap-8 mb-4 text-[12px]">
              {r.customerName && <div><p style={{ color: '#94a3b8' }}>Customer</p><p className="font-semibold">{r.customerName}</p>{r.customerPhone && <p style={{ color: '#64748b' }}>{r.customerPhone}</p>}</div>}
              {r.servedBy && <div><p style={{ color: '#94a3b8' }}>Served by</p><p className="font-semibold">{r.servedBy}</p></div>}
            </div>
          )}
          <ItemsTable r={r} accent={accent} />
          <TotalsPanel t={t} r={r} accent={accent} />
          <Footer business={business} qr={qr} note={r.notes || 'Goods remain exchangeable with this receipt.'} />
        </div>
      </div>
    );
  },
);
RetailReceiptNode.displayName = 'RetailReceiptNode';

// --- 3. Service receipt -------------------------------------------------------

export const ServiceReceiptNode = forwardRef<HTMLDivElement, NodeProps>(
  ({ business, receipt: r, accent, qr }, ref) => {
    const t = receiptTotals(r.items, r.taxPct, r.discountPct, r.amountPaid);
    return (
      <div ref={ref} style={sheetStyle} className="rounded-2xl overflow-hidden">
        <SheetHeader business={business} r={r} accent={accent} title="Service receipt" />
        <div className="px-7 py-6">
          <div className="grid grid-cols-3 gap-4 mb-5 text-[12px]">
            <div><p style={{ color: '#94a3b8' }}>Customer</p><p className="font-semibold">{r.customerName || '—'}</p>{r.customerPhone && <p style={{ color: '#64748b' }}>{r.customerPhone}</p>}</div>
            <div><p style={{ color: '#94a3b8' }}>Attended by</p><p className="font-semibold">{r.servedBy || '—'}</p></div>
            <div><p style={{ color: '#94a3b8' }}>Job reference</p><p className="font-semibold">{r.reference || r.number}</p></div>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: accent }}>Work carried out</p>
          <ItemsTable r={r} accent={accent} />
          <TotalsPanel t={t} r={r} accent={accent} />
          <Footer
            business={business}
            qr={qr}
            // The warranty sentence is the reason a service receipt is kept at
            // all, so it is part of the document rather than an optional note.
            note={r.notes || 'Keep this receipt — it is required for any follow-up or rework on this job.'}
          />
        </div>
      </div>
    );
  },
);
ServiceReceiptNode.displayName = 'ServiceReceiptNode';

// --- 4. Official receipt ------------------------------------------------------

export const ProfessionalReceiptNode = forwardRef<HTMLDivElement, NodeProps>(
  ({ business, receipt: r, accent, qr }, ref) => {
    const t = receiptTotals(r.items, r.taxPct, r.discountPct, r.amountPaid);
    const purpose = r.items.map((i) => i.description).filter(Boolean).join(', ');
    return (
      <div ref={ref} style={sheetStyle} className="rounded-2xl overflow-hidden" >
        <div style={{ borderTop: `6px solid ${accent}` }} />
        <div className="px-8 py-7">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <BrandMark business={business} accent={accent} />
              <div className="min-w-0">
                <p className="text-[17px] font-bold leading-tight truncate">{business.name}</p>
                <p className="text-[11px]" style={{ color: '#64748b' }}>{[business.location, business.phone].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>Official receipt</p>
              <p className="text-[13px] font-bold">{r.number}</p>
              <p className="text-[10px]" style={{ color: '#94a3b8' }}>{issuedLabel(r.issuedAt)}</p>
            </div>
          </div>

          {/* The wording is the document. A fee receipt that does not say who
              paid, how much and what for is not evidence of anything. */}
          <div className="text-[13px] leading-7" style={{ color: '#0f172a' }}>
            <p>
              Received from <strong style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: 2 }}>{r.customerName || '—'}</strong>
            </p>
            <p className="mt-2">
              the sum of <strong style={{ color: accent }}>{money(t.total, r)}</strong>
              {t.outstanding > 0 ? ' (part payment)' : ''}
            </p>
            <p className="mt-2">
              being payment for <strong>{purpose || r.reference || '—'}</strong>
            </p>
            <p className="mt-2" style={{ color: '#475569' }}>
              paid by {r.method}{r.reference ? ` · ref ${r.reference}` : ''}.
            </p>
          </div>

          {r.items.length > 1 && (
            <div className="mt-6"><ItemsTable r={r} accent={accent} /></div>
          )}
          <TotalsPanel t={t} r={r} accent={accent} />

          <div className="mt-8 flex items-end justify-between gap-6">
            <div style={{ width: 220 }}>
              <div style={{ borderTop: '1px solid #94a3b8' }} />
              <p className="text-[11px] mt-1" style={{ color: '#64748b' }}>
                {r.servedBy || 'Authorised signature'}
              </p>
            </div>
            {qr && <img src={qr} alt="" className="w-16 h-16" />}
          </div>
          {r.notes && <p className="mt-4 text-[11px]" style={{ color: '#475569' }}>{r.notes}</p>}
          <p className="mt-3 text-[11px]" style={{ color: '#94a3b8' }}>{profileUrl(business).replace(/^https?:\/\//, '')}</p>
        </div>
      </div>
    );
  },
);
ProfessionalReceiptNode.displayName = 'ProfessionalReceiptNode';

// --- 5. Stay folio ------------------------------------------------------------

export const HospitalityReceiptNode = forwardRef<HTMLDivElement, NodeProps>(
  ({ business, receipt: r, accent, qr }, ref) => {
    const t = receiptTotals(r.items, r.taxPct, r.discountPct, r.amountPaid);
    const nights = nightsBetween(r.checkIn, r.checkOut);
    return (
      <div ref={ref} style={sheetStyle} className="rounded-2xl overflow-hidden">
        <SheetHeader business={business} r={r} accent={accent} title="Guest folio" />
        <div className="px-7 py-6">
          <div className="grid grid-cols-4 gap-3 mb-5 rounded-xl px-4 py-3 text-[12px]" style={{ background: '#f8fafc' }}>
            <div><p style={{ color: '#94a3b8' }}>Guest</p><p className="font-semibold">{r.customerName || '—'}</p></div>
            <div><p style={{ color: '#94a3b8' }}>Check-in</p><p className="font-semibold">{r.checkIn || '—'}</p></div>
            <div><p style={{ color: '#94a3b8' }}>Check-out</p><p className="font-semibold">{r.checkOut || '—'}</p></div>
            {/* Only stated once both dates exist — "0 nights" on a folio reads
                as a system error rather than a blank field. */}
            <div><p style={{ color: '#94a3b8' }}>Nights</p><p className="font-semibold">{nights > 0 ? nights : '—'}</p></div>
          </div>
          {r.reference && <p className="text-[12px] mb-3"><span style={{ color: '#94a3b8' }}>Room / booking</span> <strong>{r.reference}</strong></p>}
          <ItemsTable r={r} accent={accent} />
          <TotalsPanel t={t} r={r} accent={accent} />
          <Footer business={business} qr={qr} note={r.notes || 'We hope to welcome you back.'} />
        </div>
      </div>
    );
  },
);
HospitalityReceiptNode.displayName = 'HospitalityReceiptNode';

// --- 6. Waybill receipt -------------------------------------------------------

export const DeliveryReceiptNode = forwardRef<HTMLDivElement, NodeProps>(
  ({ business, receipt: r, accent, qr }, ref) => {
    const t = receiptTotals(r.items, r.taxPct, r.discountPct, r.amountPaid);
    return (
      <div ref={ref} style={sheetStyle} className="rounded-2xl overflow-hidden">
        <SheetHeader business={business} r={r} accent={accent} title="Waybill receipt" />
        <div className="px-7 py-6">
          <div className="grid grid-cols-2 gap-4 mb-5 text-[12px]">
            <div className="rounded-xl px-4 py-3" style={{ background: '#f8fafc' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: accent }}>From</p>
              <p className="font-semibold mt-1" style={{ whiteSpace: 'pre-wrap' }}>{r.fromLabel || business.location || '—'}</p>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: '#f8fafc' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: accent }}>To</p>
              <p className="font-semibold mt-1" style={{ whiteSpace: 'pre-wrap' }}>{r.toLabel || r.customerName || '—'}</p>
              {r.customerPhone && <p style={{ color: '#64748b' }}>{r.customerPhone}</p>}
            </div>
          </div>
          {r.reference && <p className="text-[12px] mb-3"><span style={{ color: '#94a3b8' }}>Waybill ref</span> <strong>{r.reference}</strong></p>}
          <ItemsTable r={r} accent={accent} />
          <TotalsPanel t={t} r={r} accent={accent} />
          <div className="mt-6 flex items-end gap-8">
            <div style={{ flex: 1 }}>
              <div style={{ borderTop: '1px solid #94a3b8' }} />
              <p className="text-[11px] mt-1" style={{ color: '#64748b' }}>Received by (name & signature)</p>
            </div>
            <div style={{ width: 140 }}>
              <div style={{ borderTop: '1px solid #94a3b8' }} />
              <p className="text-[11px] mt-1" style={{ color: '#64748b' }}>Date</p>
            </div>
          </div>
          <Footer business={business} qr={qr} note={r.notes} />
        </div>
      </div>
    );
  },
);
DeliveryReceiptNode.displayName = 'DeliveryReceiptNode';
