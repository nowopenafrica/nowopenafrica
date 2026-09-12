import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, X, ExternalLink, RefreshCw, CheckSquare } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { websiteHref } from '../../lib/webLink';
import { scoreConfidence } from '../../lib/radar/confidence';
import { normalizeBusiness } from '../../lib/radar/normalize';
import { parseServicesJson, parseFaqsJson } from '../../lib/imports/profileFields';
import DiscoveryPanel from './DiscoveryPanel';
import SmartImg from '../SmartImg';

/**
 * Admin → Data Operations → Review Queue.
 *
 * The missing half. Suggestions could be received and imports staged, but
 * nothing could be acted on: an admin had no way to approve what the public
 * sent. This is that screen, and it deliberately serves every origin — a
 * customer suggestion, a bulk import row and a Radar discovery all arrive here
 * looking the same, because they are all the same thing: an assertion that a
 * business exists, waiting for a person to agree.
 *
 * Publishing creates an UNCLAIMED business. It never assigns an owner.
 */
/**
 * The jsonb staging bag. Keys a discovery or import wrote under the candidate
 * columns — services_json (the price list), raw display strings like pricing or
 * duration, and social handles spread onto their platform keys so a publish can
 * assemble social_links. Display only here: the publish projects its own whitelist.
 */
interface CandidateProfile {
  services_json?: string | null;
  pricing?: string | null;
  duration?: string | null;
  dimensions?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
  service_details?: string | null;
  product_details?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  tiktok?: string | null;
  linkedin?: string | null;
  youtube?: string | null;
  about?: string | null;
  mission?: string | null;
  vision?: string | null;
  tagline?: string | null;
  opening_hours?: string | null;
  founded_year?: string | null;
  employees?: string | null;
  business_type?: string | null;
  languages?: string | null;
  payment_methods?: string | null;
  service_area?: string | null;
  faqs_json?: string | null;
}

interface Candidate {
  id: string;
  source_key: string;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  whatsapp?: string | null;
  website: string | null;
  email: string | null;
  description: string | null;
  confidence: number;
  status: string;
  created_at: string;
  profile?: CandidateProfile | null;
}

const SOURCE_LABEL: Record<string, string> = {
  public_suggestion: 'Suggested by a customer',
  business_submission: 'Submitted by the business',
  admin_import: 'Bulk import',
  // The first origin nobody typed: found by asking an authorised source.
  wikidata: 'Found on Wikidata (CC0)',
  // First-party origins: the business typed this into a NowOpen form itself.
  business_registration: 'Registered on Digital Forms',
  waitlist: 'From the launch waitlist',
  // Third-party origins discovered through an authorised API.
  google: 'Found on Google Maps (Places)',
};

export default function ReviewQueue() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('radar_candidates')
      .select('id,source_key,name,category,city,address,phone,whatsapp,website,email,description,confidence,status,created_at,profile')
      .in('status', ['pending', 'review'])
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50000);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as Candidate[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const publish = async (c: Candidate) => {
    setWorking(c.id);
    const { error } = await supabase.rpc('radar_publish_candidate', { p_candidate: c.id });
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${c.name} published as an unclaimed listing`);
    setRows((r) => r.filter((x) => x.id !== c.id));
  };

  const reject = async (c: Candidate) => {
    setWorking(c.id);
    const { error } = await supabase
      .from('radar_candidates')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), decision_reason: 'Rejected in review' })
      .eq('id', c.id);
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== c.id));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  /** Publish every selected candidate; each runs its own atomic RPC. */
  const publishSelected = async () => {
    const targets = rows.filter((r) => selected.has(r.id));
    if (targets.length === 0) return;
    setBulkWorking(true);
    let ok = 0;
    let failed = 0;
    let firstError = '';
    const published = new Set<string>();
    for (const c of targets) {
      const { error } = await supabase.rpc('radar_publish_candidate', { p_candidate: c.id });
      if (error) {
        failed += 1;
        if (!firstError) firstError = error.message;
      } else {
        ok += 1;
        published.add(c.id);
      }
    }
    setBulkWorking(false);
    setRows((r) => r.filter((x) => !published.has(x.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of published) next.delete(id);
      return next;
    });
    if (failed === 0) toast.success(`Published ${ok} as unclaimed`);
    else if (ok === 0) toast.error(`Nothing published — ${firstError}`);
    else toast.error(`Published ${ok}, ${failed} failed — ${firstError}`);
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500 py-8">
        <Loader2 size={16} className="animate-spin" /> Loading the queue…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Discovery sits above the queue it feeds: find, then review, then
          publish — in the order an operator actually works. */}
      <DiscoveryPanel onStaged={() => { void load(); }} />

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Review Queue</h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">
            Suggestions, imports and discoveries, strongest first. Publishing creates an unclaimed
            listing — it never gives anyone an account.
          </p>
        </div>
        <button onClick={() => { setSelected(new Set()); void load(); }} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 dark:text-gray-300">
          <RefreshCw size={13} /> Refresh
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">Nothing waiting. The queue is clear.</p>
        </div>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-900 dark:border-white bg-gray-900 dark:bg-white px-4 py-2.5">
              <p className="text-[12px] font-bold text-white dark:text-gray-900">{selected.size} selected</p>
              <div className="flex items-center gap-2">
                <button onClick={() => void publishSelected()} disabled={bulkWorking || rows.filter((r) => selected.has(r.id)).length === 0}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-[12px] font-bold disabled:opacity-60">
                  {bulkWorking ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {bulkWorking ? 'Publishing…' : 'Publish as unclaimed'}
                </button>
                <button onClick={() => setSelected(new Set())} disabled={bulkWorking}
                  className="text-[12px] font-semibold text-white/80 dark:text-gray-900/80 hover:text-white dark:hover:text-gray-900 disabled:opacity-60">
                  Clear
                </button>
              </div>
            </div>
          )}

          <p className="text-[12px] text-gray-500 flex items-center gap-3">
            {rows.length} waiting
            <button onClick={toggleSelectAll} disabled={bulkWorking}
              className="inline-flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50">
              <CheckSquare size={13} />
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
            {selected.size > 0 && <span className="text-gray-400">{selected.size} selected</span>}
          </p>
          <ul className="space-y-2">
            {rows.map((c) => {
              const n = normalizeBusiness(c);
              const live = n ? scoreConfidence({ normalized: n }) : null;
              const p = c.profile ?? {};
              const thumb = p.logo_url ?? p.image_url;
              return (
                <li key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} disabled={bulkWorking}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-gray-900 dark:accent-white disabled:opacity-50" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2.5">
                        {thumb ? (
                          <SmartImg src={thumb} alt={`${c.name} logo`} className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shrink-0" />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{c.name}</p>
                          {p.tagline && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 italic mt-px">{p.tagline}</p>
                          )}
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {[c.category, c.city].filter(Boolean).join(' · ') || 'No category or city'}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {SOURCE_LABEL[c.source_key] ?? c.source_key}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                        {live?.score ?? c.confidence}%
                      </span>
                      <span className="block text-[10px] text-gray-500">confidence</span>
                    </div>
                  </div>

                  {c.description && (
                    <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 line-clamp-2">{c.description}</p>
                  )}

                  <dl className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    {([['Phone', c.phone], ['WhatsApp', c.whatsapp], ['Website', c.website], ['Email', c.email], ['Address', c.address]] as const)
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-1.5 min-w-0">
                          <dt className="text-gray-400 shrink-0">{k}</dt>
                          <dd className="text-gray-700 dark:text-gray-200 truncate">{v}</dd>
                        </div>
                      ))}
                  </dl>

                  {(() => {
                    const services = parseServicesJson(p.services_json ?? null);
                    const socials = ([p.instagram, p.facebook, p.twitter, p.tiktok, p.linkedin, p.youtube] as (string | null | undefined)[])
                      .filter((s): s is string => !!s)
                      .map((s) => s.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
                    const extras = ([['Pricing', p.pricing], ['Duration', p.duration], ['Dimensions', p.dimensions]] as const)
                      .filter(([, v]) => v) as [string, string][];
                    const faqs = parseFaqsJson(p.faqs_json ?? null);
                    const listFields = ([['Languages', p.languages], ['Payment', p.payment_methods], ['Service area', p.service_area], ['Employees', p.employees], ['Business type', p.business_type]] as const)
                      .filter(([, v]) => v) as [string, string][];
                    const narrative = ([['About', p.about], ['Mission', p.mission], ['Vision', p.vision]] as const)
                      .filter(([, v]) => v) as [string, string][];
                    const hours = p.opening_hours;
                    const founded = p.founded_year;
                    const hasContent = services.length || socials.length || extras.length || faqs.length || listFields.length || narrative.length || hours || founded;
                    if (!hasContent) return null;
                    return (
                      <div className="mt-2 space-y-1.5">
                        {narrative.length > 0 && (
                          <div className="space-y-1">
                            {narrative.map(([k, v]) => (
                              <p key={k} className="text-[11px]">
                                <span className="text-gray-400 font-semibold">{k}</span>{' '}
                                <span className="text-gray-700 dark:text-gray-200">{v}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        {(hours || founded) && (
                          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                            {hours && (
                              <div className="flex gap-1.5 min-w-0">
                                <dt className="text-gray-400 shrink-0">Hours</dt>
                                <dd className="text-gray-700 dark:text-gray-200 truncate">{hours}</dd>
                              </div>
                            )}
                            {founded && (
                              <div className="flex gap-1.5 min-w-0">
                                <dt className="text-gray-400 shrink-0">Founded</dt>
                                <dd className="text-gray-700 dark:text-gray-200 truncate">{founded}</dd>
                              </div>
                            )}
                          </dl>
                        )}
                        {extras.length > 0 && (
                          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                            {extras.map(([k, v]) => (
                              <div key={k} className="flex gap-1.5 min-w-0">
                                <dt className="text-gray-400 shrink-0">{k}</dt>
                                <dd className="text-gray-700 dark:text-gray-200 truncate">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {listFields.length > 0 && (
                          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                            {listFields.map(([k, v]) => (
                              <div key={k} className="flex gap-1.5 min-w-0">
                                <dt className="text-gray-400 shrink-0">{k}</dt>
                                <dd className="text-gray-700 dark:text-gray-200 truncate">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {services.length > 0 && (
                          <div>
                            <p className="text-[11px] text-gray-400">
                              {services.length > 8 ? `${services.length} services` : 'Services'}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {services.slice(0, 8).map((s) => (
                                <span key={s.name} title={s.description}
                                  className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-[11px] text-gray-700 dark:text-gray-200">
                                  {s.name}{s.price ? ` · ${s.price}` : ''}
                                </span>
                              ))}
                              {services.length > 8 && (
                                <span className="text-[11px] text-gray-400 self-center">+{services.length - 8} more</span>
                              )}
                            </div>
                          </div>
                        )}
                        {socials.length > 0 && (
                          <p className="text-[11px] text-gray-500">
                            <span className="text-gray-400">Socials</span> {socials.join(' · ')}
                          </p>
                        )}
                        {faqs.length > 0 && (
                          <div>
                            <p className="text-[11px] text-gray-400">
                              {faqs.length > 2 ? `${faqs.length} FAQs (showing 2)` : `${faqs.length} FAQ${faqs.length === 1 ? '' : 's'}`}
                            </p>
                            <div className="mt-1 space-y-1">
                              {faqs.slice(0, 2).map((f) => (
                                <p key={f.q} className="text-[11px]">
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">{f.q}</span>{' '}
                                  <span className="text-gray-500 dark:text-gray-400">{f.a.length > 80 ? f.a.slice(0, 80) + '…' : f.a}</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {live && live.missing.length > 0 && (
                    <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                      Missing: {live.missing.join(', ')}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => void publish(c)} disabled={working === c.id || bulkWorking}
                      className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-bold disabled:opacity-50">
                      {working === c.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Publish as unclaimed
                    </button>
                    <button onClick={() => void reject(c)} disabled={working === c.id || bulkWorking}
                      className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-lg border border-gray-300 dark:border-gray-600 text-[13px] font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50">
                      <X size={14} /> Reject
                    </button>
                    {websiteHref(c.website) && (
                      <a href={websiteHref(c.website)!} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 min-h-[38px] text-[13px] font-semibold text-blue-600 dark:text-blue-400">
                        <ExternalLink size={13} /> Check the site
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
