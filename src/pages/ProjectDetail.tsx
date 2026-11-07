import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Share2 } from 'lucide-react';

import ProjectStoryView from '../components/business/ProjectStoryView';
import EnquiryModal from '../components/EnquiryModal';
import NotFound from './NotFound';
import { applySeo, SITE_URL } from '../lib/seo';
import { whatsappHref } from '../lib/phone';
import {
  fetchProjectBusiness,
  fetchPublishedProject,
  fetchRelatedProjects,
  type BusinessProject,
  type ProjectBusiness,
} from '../lib/businessProjects';

/**
 * A project story, at its own public URL.
 *
 * `/work/:slug` is deliberately not under a business's profile path. The
 * project is the thing being shared — on WhatsApp, in a proposal, on a CV — and
 * a URL that begins with somebody else's name makes it harder to send and
 * harder to remember.
 *
 * The read is `published = true` inside the query, not a filter afterwards, so
 * a draft cannot flash into view on the way to a 404.
 */
export default function ProjectDetail() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'unavailable'>('loading');
  const [project, setProject] = useState<BusinessProject | null>(null);
  const [business, setBusiness] = useState<ProjectBusiness | null>(null);
  const [related, setRelated] = useState<BusinessProject[]>([]);
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setProject(null);
    setBusiness(null);
    setRelated([]);

    void (async () => {
      const read = await fetchPublishedProject(slug);
      if (cancelled) return;

      if (read.state === 'unavailable') {
        setState('unavailable');
        return;
      }
      if (!read.project) {
        setState('missing');
        return;
      }

      const [owner, more] = await Promise.all([
        fetchProjectBusiness(read.project.business_id),
        fetchRelatedProjects(read.project.business_id, read.project.id),
      ]);
      if (cancelled) return;

      setProject(read.project);
      setBusiness(owner);
      setRelated(more);
      setState('ready');
    })();

    return () => { cancelled = true; };
  }, [slug]);

  const projectPath = project ? `/work/${project.slug || project.id}` : '';
  const businessHref = business?.username
    ? `/${business.username}`
    : business ? `/businesses/${business.id}` : null;

  useEffect(() => {
    if (!project) return undefined;

    const owner = business?.name ?? 'a business on NowOpen Africa';
    const summary = (project.seo_description || project.summary || '').trim();
    const description = summary
      ? summary.slice(0, 300)
      : `${project.title} — a project by ${owner} on NowOpen Africa.`;
    const cover = project.cover_url || project.images[0]?.url || business?.image_url || business?.logo_url;
    const image = cover
      ? (cover.startsWith('http') ? cover : `${SITE_URL}${cover}`)
      : `${SITE_URL}/og-image.png`;
    const url = `${SITE_URL}${projectPath}`;
    const title = (project.seo_title || project.title).slice(0, 120);

    return applySeo({
      title: `${title} — ${owner} | NowOpen Africa`,
      description,
      path: projectPath,
      image,
      type: 'article',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CreativeWork',
          '@id': url,
          name: project.title,
          description,
          url,
          ...(cover ? { image: [image] } : {}),
          ...(project.category ? { genre: project.category } : {}),
          ...(project.completed_on ? { dateCreated: project.completed_on } : {}),
          ...(project.tags.length ? { keywords: project.tags.join(', ') } : {}),
          creator: {
            '@type': 'Organization',
            name: owner,
            ...(businessHref ? { url: `${SITE_URL}${businessHref}` } : {}),
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'NowOpen Africa', item: SITE_URL },
            ...(businessHref
              ? [{ '@type': 'ListItem', position: 2, name: owner, item: `${SITE_URL}${businessHref}` }]
              : []),
            { '@type': 'ListItem', position: businessHref ? 3 : 2, name: project.title, item: url },
          ],
        },
      ],
    });
  }, [project, business, businessHref, projectPath]);

  const share = useCallback(async () => {
    if (!project) return;
    const url = `${window.location.origin}${projectPath}`;
    const data = {
      title: project.title,
      text: project.summary ?? undefined,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Project link copied.');
    } catch (error) {
      // A cancelled share sheet is not an error worth shouting about.
      if ((error as { name?: string })?.name === 'AbortError') return;
      toast.error('Could not share that link.');
    }
  }, [project, projectPath]);

  if (state === 'missing') return <NotFound />;

  if (state === 'unavailable') {
    return (
      <div className="site-container py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 p-8 text-center dark:border-gray-700">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">This project could not load</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            That is a connection problem on our side, not a missing project. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (state === 'loading' || !project) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="animate-spin text-gray-400" size={24} aria-label="Loading project" />
      </div>
    );
  }

  const owner = business?.name ?? 'this business';

  return (
    <>
      <div className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="site-container flex min-h-[52px] items-center justify-between gap-3 py-2">
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {businessHref ? (
              <>
                Work by{' '}
                <Link to={businessHref} className="font-semibold text-gray-800 hover:underline dark:text-gray-200">
                  {owner}
                </Link>
              </>
            ) : (
              `Work by ${owner}`
            )}
          </p>
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            <Share2 size={13} aria-hidden /> Share
          </button>
        </div>
      </div>

      <ProjectStoryView
        project={project}
        businessName={owner}
        businessHref={businessHref}
        related={related}
        onEnquire={() => setEnquiryOpen(true)}
        whatsappHref={business?.phone
          ? whatsappHref(
              business.phone,
              business.location ?? undefined,
              `Hi ${owner}, I found your project "${project.title}" on NowOpen Africa and I'd like to talk about something similar.`,
            )
          : null}
      />

      {enquiryOpen && (
        <EnquiryModal
          businessId={project.business_id}
          businessName={owner}
          businessEmail={business?.email ?? undefined}
          context={project.title}
          onClose={() => setEnquiryOpen(false)}
        />
      )}
    </>
  );
}
