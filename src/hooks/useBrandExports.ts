import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Business } from '../types';
import { profileUrl, generateQr, downloadUrl, slugForFile, exportNodeToPng, downloadNodePdf } from '../lib/studio';

// Shared card/QR export logic used by BrandCardStudio and the Export Centre.
export function useBrandExports(business: Business) {
  const [qr, setQr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportingQr, setExportingQr] = useState(false);
  const [exportingKit, setExportingKit] = useState(false);
  const [exportingSmartId, setExportingSmartId] = useState(false);
  const [exportingSmartIdFront, setExportingSmartIdFront] = useState(false);
  const [exportingSmartIdPdf, setExportingSmartIdPdf] = useState(false);
  const [exportingSmartIdFrontPdf, setExportingSmartIdFrontPdf] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const smartIdRef = useRef<HTMLDivElement>(null);
  const smartIdFrontRef = useRef<HTMLDivElement>(null);

  const url = profileUrl(business);

  useEffect(() => {
    if (url) generateQr(url, { size: 1024 }).then(setQr).catch(() => setQr(''));
  }, [url]);

  const exportCardPng = useCallback(async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await exportNodeToPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      downloadUrl(dataUrl, `${slugForFile(business.name)}-card.png`);
      toast.success('Business card downloaded');
    } catch {
      toast.error('Could not export the image — try again.');
    } finally {
      setExporting(false);
    }
  }, [business.name]);

  const exportQrPng = useCallback(async () => {
    if (!qrRef.current) return;
    setExportingQr(true);
    try {
      const dataUrl = await exportNodeToPng(qrRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' });
      downloadUrl(dataUrl, `${slugForFile(business.name)}-qr.png`);
      toast.success('Smart QR downloaded');
    } catch {
      toast.error('Could not export the QR — try again.');
    } finally {
      setExportingQr(false);
    }
  }, [business.name]);

  // Card + QR together, rasterised first then downloaded back-to-back.
  const exportCardKit = useCallback(async () => {
    if (!cardRef.current || !qrRef.current) return;
    setExportingKit(true);
    try {
      const [card, qr] = await Promise.all([
        exportNodeToPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' }),
        exportNodeToPng(qrRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' }),
      ]);
      downloadUrl(card, `${slugForFile(business.name)}-card.png`);
      downloadUrl(qr, `${slugForFile(business.name)}-qr.png`);
      toast.success('Card + smart QR downloaded');
    } catch {
      toast.error('Could not export the card + QR — try again.');
    } finally {
      setExportingKit(false);
    }
  }, [business.name]);

  // The modern smart ID card, exported with its dark backdrop so the rounded
  // corners stay seamless.
  const exportSmartIdPng = useCallback(async () => {
    if (!smartIdRef.current) return;
    setExportingSmartId(true);
    try {
      const dataUrl = await exportNodeToPng(smartIdRef.current, { pixelRatio: 2, backgroundColor: '#0f172a' });
      downloadUrl(dataUrl, `${slugForFile(business.name)}-smart-id.png`);
      toast.success('Smart ID card downloaded');
    } catch {
      toast.error('Could not export the Smart ID — try again.');
    } finally {
      setExportingSmartId(false);
    }
  }, [business.name]);

  const exportSmartIdPdf = useCallback(async () => {
    if (!smartIdRef.current) return;
    setExportingSmartIdPdf(true);
    try {
      await downloadNodePdf(smartIdRef.current, `${slugForFile(business.name)}-smart-id.pdf`, { backgroundColor: '#0f172a' });
      toast.success('Smart ID card PDF downloaded');
    } catch {
      toast.error('Could not export the Smart ID PDF — try again.');
    } finally {
      setExportingSmartIdPdf(false);
    }
  }, [business.name]);

  // The front (identity) side of the Smart ID card.
  const exportSmartIdFrontPng = useCallback(async () => {
    if (!smartIdFrontRef.current) return;
    setExportingSmartIdFront(true);
    try {
      const dataUrl = await exportNodeToPng(smartIdFrontRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      downloadUrl(dataUrl, `${slugForFile(business.name)}-smart-id-front.png`);
      toast.success('Smart ID front downloaded');
    } catch {
      toast.error('Could not export the Smart ID front — try again.');
    } finally {
      setExportingSmartIdFront(false);
    }
  }, [business.name]);

  const exportSmartIdFrontPdf = useCallback(async () => {
    if (!smartIdFrontRef.current) return;
    setExportingSmartIdFrontPdf(true);
    try {
      await downloadNodePdf(smartIdFrontRef.current, `${slugForFile(business.name)}-smart-id-front.pdf`, { backgroundColor: '#ffffff' });
      toast.success('Smart ID front PDF downloaded');
    } catch {
      toast.error('Could not export the Smart ID front PDF — try again.');
    } finally {
      setExportingSmartIdFrontPdf(false);
    }
  }, [business.name]);

  return {
    qr, cardRef, qrRef, smartIdRef, smartIdFrontRef,
    exporting, exportingQr, exportingKit, exportingSmartId, exportingSmartIdFront,
    exportingSmartIdPdf, exportingSmartIdFrontPdf,
    exportCardPng, exportQrPng, exportCardKit, exportSmartIdPng, exportSmartIdPdf,
    exportSmartIdFrontPng, exportSmartIdFrontPdf,
  };
}
