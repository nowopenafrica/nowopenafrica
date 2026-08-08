import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Sparkles, ArrowRight } from 'lucide-react';

// The AI Prompt Library (#15) — every proven prompt the team uses, organised.
// Video, image, voice, copy, animation and social. Copy a prompt straight into
// the tool of your choice, or hand it to the Content Factory.

interface Prompt {
  id: string;
  category: 'Video' | 'Image' | 'Voice' | 'Copy' | 'Animation' | 'Social';
  title: string;
  text: string;
  tags: string[];
}

const CATEGORIES: Prompt['category'][] = ['Video', 'Image', 'Voice', 'Copy', 'Animation', 'Social'];

const PROMPTS: Prompt[] = [
  { id: 'p1', category: 'Video', title: 'Signature dish reveal', text: 'Produce a 15s vertical promo for {business}, a {category} in {location}. Open on the signature {dish}, steam rising. Cut to a customer reaction, then the name + address + "Open Now". Fast cuts, bold captions, upbeat Afrobeat. End card: gradient purple→blue with the NowOpen mark.', tags: ['reels', 'food', '15s'] },
  { id: 'p2', category: 'Video', title: 'Before & after glow-up', text: 'Make a 12s split-screen before/after reel for {business}: worn-out side fading into the fresh result, "Swipe for the reveal" hook, light tempo, clean sans captions. Call to action: "Book your seat before it is gone".', tags: ['salon', 'before-after'] },
  { id: 'p3', category: 'Video', title: 'Grand opening teaser', text: 'Write a 20s teaser for a new {business} branch opening. Three quick title cards building suspense ("Something big is coming…"), then a montage of the space, staff and menu, finishing with the date, venue and a calendar CTA.', tags: ['launch', 'teaser'] },
  { id: 'p4', category: 'Image', title: 'Offer flyer', text: 'Design a square flyer for a weekend offer at {business}: bold headline {offer}, the brand palette (purple→blue gradient), one product photo, opening hours, phone and a scannable QR to the profile. Keep 4-line max rule.', tags: ['flyer', 'offer'] },
  { id: 'p5', category: 'Image', title: 'Menu story post', text: 'Create a 9:16 story post: 3 slides — (1) hero dish photo with a "Menu" sticker, (2) price list in a clean card, (3) location + "Order now" arrow. Consistent background colour from the brand palette.', tags: ['menu', 'stories'] },
  { id: 'p6', category: 'Voice', title: '30s radio spot', text: 'Write a 30s radio script for {business} targeting {location}. Warm, energetic Nigerian voice. Hook in the first 3 seconds, one clear offer, phone number said twice, ends with the NowOpen tagline.', tags: ['radio', 'advert', '30s'] },
  { id: 'p7', category: 'Voice', title: 'Testimonial interview script', text: 'Script a 90s customer interview for {business}: opener with a hook line, three short questions (how they found it, favourite part, what they would tell a friend), and a closing CTA. Leave pauses for b-roll.', tags: ['interview', 'testimonial'] },
  { id: 'p8', category: 'Copy', title: 'Business bio rewrite', text: 'Rewrite the profile bio for {business} in the NowOpen voice: friendly, concrete, under 120 words. Lead with the single best thing they offer, mention {location} and a differentiator, end with a soft invite to visit.', tags: ['bio', 'profile'] },
  { id: 'p9', category: 'Copy', title: 'Weekend offer caption', text: 'Write 5 caption options for a weekend offer at {business} ({offer}). Each under 40 words, one emoji max, a curiosity hook, and a clear "how to claim". Append hashtags: #LocalEats #NowOpenAfrica #${location}.', tags: ['caption', 'offer'] },
  { id: 'p10', category: 'Animation', title: 'Logo reveal lottie', text: 'Animate the NowOpen mark into a 3s Lottie logo reveal: scale from 0.85 with a soft overshoot, gradient sweep across the glyph, subtle shadow. Export JSON, 24fps, dark background variant.', tags: ['lottie', 'logo'] },
  { id: 'p11', category: 'Animation', title: 'Kinetic typography quote', text: 'Animate the quote "{quote}" as kinetic typography: key words pop on the beat, one colour accent from the brand gradient, 9:16, 6s, with a fade end screen holding the attribution.', tags: ['kinetic', 'quote'] },
  { id: 'p12', category: 'Social', title: 'Engagement poll sequence', text: 'Plan a 3-day poll sequence for {business}: Day 1 multiple choice (menu), Day 2 yes/no (new branch), Day 3 emoji slider (service rating). Add a story CTA each day driving to the profile link.', tags: ['stories', 'polls', '3-day'] },
];

export default function PromptLibrary() {
  const [category, setCategory] = useState<Prompt['category'] | 'All'>('All');
  const prompts = category === 'All' ? PROMPTS : PROMPTS.filter((p) => p.category === category);

  const copy = (p: Prompt) => {
    navigator.clipboard?.writeText(p.text).then(() => toast.success(`"${p.title}" copied to clipboard`)).catch(() => toast.error('Could not copy — select the text manually.'));
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Prompt library</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{PROMPTS.length} proven prompts across {CATEGORIES.length} categories. Placeholders like <code className="text-[10px] font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{"{business}"}</code> get filled in per client.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['All', ...CATEGORIES] as const).map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${category === c ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {prompts.map((p) => (
          <div key={p.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">{p.title}</h4>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 shrink-0">{p.category}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed flex-1">{p.text}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{t}</span>)}
            </div>
            <button onClick={() => copy(p)}
              className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition">
              <Copy size={13} /> Copy prompt
            </button>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
        Run a copy prompt end-to-end in the Content Factory <ArrowRight size={11} /> (it already writes in the NowOpen voice).
      </p>
    </div>
  );
}
