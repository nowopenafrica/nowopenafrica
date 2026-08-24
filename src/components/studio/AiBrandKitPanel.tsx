import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Copy, Download, Loader2, Mail, PenLine, Printer, Image as ImageIcon, MessageCircle, Linkedin, Monitor, CreditCard } from 'lucide-react';
import { Business } from '../../types';
import { downloadText, downloadUrl, exportNodeToPng, slugForFile, profileUrl } from '../../lib/studio';
import { downloadLetterheadPdf } from '../../lib/studioBrand';
import { BrandIdentity } from '../../lib/brandIdentity';
import { BrandPalette } from '../../lib/studioBrand';
import { useCardSettings } from '../../hooks/useCardSettings';
import {
  EmailSignatureNode, SocialAvatarNode, LinkedinBannerNode, EmailBannerNode, ZoomBackgroundNode,
} from './BrandKitNodes';
import NowOpenMark from '../NowOpenMark';

function signatureHtml(business: Business, identity: BrandIdentity, holderName: string, holderRole: string) {
  const host = profileUrl(business).replace(/^https?:\/\//, '');
  const name = holderName || business.name;
  const role = holderRole || business.category;
  const logo = business.logo_url
    // This HTML is pasted into an email signature, so the alt text is what a
    // recipient with images disabled actually sees — a very common default in
    // corporate mail clients.
    ? `<img src="${business.logo_url}" alt="${business.name} logo" width="56" height="56" style="border-radius:12px;border:1px solid #e5e7eb" />`
    : `<div style="width:56px;height:56px;border-radius:12px;background:#f3f4f6;color:#6b7280;font:700 22px Arial,sans-serif;display:flex;align-items:center;justify-content:center">${business.name.charAt(0)}</div>`;
  return `<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:13px;line-height:1.5">
  <tr>
    <td style="padding-right:12px">${logo}</td>
    <td>
      <p style="margin:0;font-weight:700;font-size:15px;color:#111827">${name}</p>
      <p style="margin:0;color:#6b7280;font-size:12px">${role}</p>
      <p style="margin:6px 0 0;color:#374151">${[business.phone, business.email].filter(Boolean).join(' &nbsp;·&nbsp; ')}</p>
      <p style="margin:0;color:#374151">${[host, business.location].filter(Boolean).join(' &nbsp;·&nbsp; ')}</p>
    </td>
  </tr>
</table>
<p style="margin:10px 0 0;color:#9ca3af;font-size:11px;font-family:Arial,Helvetica,sans-serif">${identity.tagline || business.category} — ${business.name} · nowopenafrica.com</p>`;
}

interface Props {
  business: Business;
  identity: BrandIdentity;
  palette: BrandPalette;
}

export default function AiBrandKitPanel({ business, identity, palette }: Props) {
  const { settings } = useCardSettings(business.id);
  const accent = palette.primary;
  const sigRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const liRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async (key: string, node: HTMLDivElement | null, opts: { pixelRatio?: number; backgroundColor?: string }, filename: string) => {
    if (!node || busy) return;
    setBusy(key);
    try {
      const dataUrl = await exportNodeToPng(node, opts);
      downloadUrl(dataUrl, filename);
      toast.success(`${filename.split('-').slice(0, -1).join(' ')} downloaded`);
    } catch {
      toast.error('Could not export that asset — try again.');
    } finally {
      setBusy('');
    }
  };

  const html = signatureHtml(business, identity, settings.holderName, settings.holderRole);

  const copySignature = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Signature HTML copied — paste it into your email settings');
    } catch {
      toast.error('Could not copy — use the download instead.');
    }
  };

  const items: { key: string; icon: typeof Mail; label: string; detail: string; run: () => void }[] = [
    { key: 'sig', icon: Mail, label: 'Email signature', detail: 'PNG preview + HTML for Gmail/Outlook', run: () => run('sig', sigRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' }, `${slugForFile(business.name)}-email-signature.png`) },
    { key: 'letter', icon: PenLine, label: 'Letterhead', detail: 'A4 PDF with your brand header', run: () => { downloadLetterheadPdf(business, identity, palette); toast.success('Letterhead PDF downloaded'); } },
    { key: 'avatar', icon: ImageIcon, label: 'Social avatar', detail: 'Square profile picture', run: () => run('avatar', avatarRef.current, { pixelRatio: 2 }, `${slugForFile(business.name)}-avatar.png`) },
    { key: 'wa', icon: MessageCircle, label: 'WhatsApp DP', detail: 'Sharp profile photo for WhatsApp', run: () => run('wa', avatarRef.current, { pixelRatio: 2 }, `${slugForFile(business.name)}-whatsapp-dp.png`) },
    { key: 'linkedin', icon: Linkedin, label: 'LinkedIn banner', detail: '1584 × 396 header', run: () => run('linkedin', liRef.current, { pixelRatio: 2 }, `${slugForFile(business.name)}-linkedin-banner.png`) },
    { key: 'email', icon: CreditCard, label: 'Email banner', detail: '600 × 200 newsletter header', run: () => run('email', emailRef.current, { pixelRatio: 2 }, `${slugForFile(business.name)}-email-banner.png`) },
    { key: 'zoom', icon: Monitor, label: 'Zoom background', detail: '1280 × 720 meeting backdrop', run: () => run('zoom', zoomRef.current, { pixelRatio: 1 }, `${slugForFile(business.name)}-zoom-background.png`) },
  ];

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        One click — no design needed. Every file is generated from your logo, colours, voice and identity, so the whole set is consistent.
      </p>

      {/* Offscreen export nodes */}
      <div aria-hidden style={{ position: 'absolute', left: -9999, top: 0, pointerEvents: 'none' }}>
        <EmailSignatureNode ref={sigRef} business={business} identity={identity} accent={accent} />
        <SocialAvatarNode ref={avatarRef} business={business} identity={identity} accent={accent} />
        <LinkedinBannerNode ref={liRef} business={business} identity={identity} accent={accent} />
        <EmailBannerNode ref={emailRef} business={business} identity={identity} accent={accent} />
        <ZoomBackgroundNode ref={zoomRef} business={business} identity={identity} accent={accent} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((it) => (
          <div key={it.key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <it.icon size={16} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{it.label}</p>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 flex-1">{it.detail}</p>
            <button onClick={it.run} disabled={busy === it.key}
              className="inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 disabled:opacity-50 min-h-[44px]">
              {busy === it.key ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download
            </button>
          </div>
        ))}
      </div>

      {/* Email signature extras */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={copySignature} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px]">
          {copied ? <Check size={13} className="text-green-600 dark:text-green-400" /> : <Copy size={13} />} Copy signature HTML
        </button>
        <button onClick={() => { downloadText(html, `${slugForFile(business.name)}-email-signature.html`, 'text/html;charset=utf-8'); toast.success('Signature HTML downloaded'); }}
          className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px]">
          <Download size={13} /> Download signature (.html)
        </button>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 ml-auto">
          <Printer size={12} /> Also on Export Centre — business card & Smart ID
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={15} className="text-purple-600 dark:text-purple-400" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Email signature preview</p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 border border-gray-100 dark:border-gray-700 max-w-xl">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
              {business.logo_url
                ? <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
                : <span className="text-lg font-bold" style={{ color: accent }}>{business.name.slice(0, 1)}</span>}
            </div>
            <div className="text-xs">
              <p className="font-bold text-gray-900 dark:text-white">{settings.holderName || business.name}</p>
              <p className="text-gray-500">{settings.holderRole || business.category}</p>
              <p className="text-gray-700 dark:text-gray-300 mt-1">{[business.phone, business.email].filter(Boolean).join(' · ')}</p>
              <p className="text-gray-700 dark:text-gray-300">{profileUrl(business).replace(/^https?:\/\//, '')}{business.location ? ` · ${business.location}` : ''}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <NowOpenMark size={16} />
            <span className="text-[10px] text-gray-400 font-semibold tracking-wider">NOWOPEN AFRICA MEMBER</span>
          </div>
        </div>
      </div>
    </div>
  );
}
