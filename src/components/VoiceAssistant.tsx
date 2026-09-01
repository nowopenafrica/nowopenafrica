import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mic, MicOff, Loader2, X, Ear, Send, Keyboard } from 'lucide-react';
import {
  stripWakePhrase, parseVoiceCommand, matchCategory, searchUrlFor, replyFor,
  openNowUrl, spokenOpenState, notFoundReply,
} from '../lib/voiceCommands';
import { detectLocation, isGeolocationSupported } from '../lib/geolocation';
import { supabase } from '../lib/supabase';
import { telHref } from '../lib/phone';
import { publicOpenState } from '../lib/openingHours';
import {
  loadAlwaysListen, saveAlwaysListen, micPermissionState, shouldListen,
  type MicPermission,
} from '../lib/voiceWake';
import {
  detectCapability, capabilityFrom, languageChain, classifyRecognitionError,
  restartDelay, shouldFallBackToTyping, type VoiceCapability,
} from '../lib/voiceRuntime';

// Voice control for the platform: "NowOpen AI — I need a barber in my area".
//
// WHAT THE BROWSER ALLOWS
//
// Hands-free with NO tapping is possible, with one unavoidable caveat: the very
// first grant of microphone permission needs a gesture. After that the browser
// remembers it for the origin, so every later visit starts listening on page
// load — the page opens already waiting for "NowOpen AI".
//
// What is NOT possible is listening while the browser or tab is closed. A page
// does not run then, and the web has no background wake-word service. That needs
// a native app or an OS assistant integration; it is a platform boundary, not
// something code here can work around.
//
// So: opt in once (that tap grants the microphone), and from then on it is
// automatic whenever the site is open — see lib/voiceWake for the state rules,
// including stopping when the tab is hidden and reacting to permission being
// revoked in browser settings.
//
// Support is uneven: Chrome and Edge (desktop + Android) implement
// SpeechRecognition; Safari's is partial and often silently unavailable. When it
// is missing the button hides itself rather than offering something broken.

type Listening = 'off' | 'listening' | 'working';

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

const getRecogniser = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null;
};

/** Speak the confirmation, where the browser can. Never required. */
const say = (text: string) => {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* silence is fine */ }
};

/**
 * Find a business by the name someone said.
 *
 * Recognisers drop punctuation and hear brand names loosely, so the match is
 * deliberately fuzzy: an exact name first, then a prefix, then a contains.
 * Ordered by rating so "call the barber" reaches the one people actually rate
 * when several match.
 *
 * Returns null rather than the first row of a bad match — acting on the wrong
 * business is worse than admitting the miss, because the next thing the
 * assistant does is dial a phone number.
 */
async function findBusinessByName(spokenName: string) {
  const name = spokenName.trim();
  if (name.length < 2) return null;
  // PostgREST treats these as wildcards/separators inside a filter value.
  const safe = name.replace(/[%,()]/g, ' ').trim();
  if (!safe) return null;

  const { data } = await supabase
    .from('businesses')
    .select('id,name,username,location,phone,opening_hours,hours,timezone,open_status')
    // Public view only: RLS also shows an admin the unlisted prospects, and the
    // assistant must answer the same way for everybody.
    .eq('is_listable', true)
    .ilike('name', `%${safe}%`)
    .order('rating', { ascending: false })
    .limit(5);

  const rows = data || [];
  if (rows.length === 0) return null;
  const lower = safe.toLowerCase();
  return rows.find((r) => (r.name || '').toLowerCase() === lower)
    || rows.find((r) => (r.name || '').toLowerCase().startsWith(lower))
    || rows[0];
}

export default function VoiceAssistant() {
  const navigate = useNavigate();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Read inside the recogniser callbacks, which are registered once.
  const openRef = useRef(false);
  const requireWakeRef = useRef(true);
  // Read by recognition.onend, which is registered once and must not close over
  // a stale value — this is what keeps the hands-free loop alive.
  const keepListeningRef = useRef(false);

  // What this device can actually do. Never null-renders the assistant: when
  // recognition is missing the same answer engine takes typed questions.
  const [capability, setCapability] = useState<VoiceCapability>(
    () => capabilityFrom({ hasRecognition: false, hasSynthesis: false, isIOS: false }),
  );
  const [typed, setTyped] = useState('');
  // Set when speech has failed for real, so the panel leads with the text box.
  const [fallbackToTyping, setFallbackToTyping] = useState(false);
  // Restart bookkeeping for the hands-free loop, read inside recogniser
  // callbacks that are registered once.
  const attemptRef = useRef(0);
  const langIndexRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Listening>('off');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [requireWake, setRequireWake] = useState(true);
  // Hands-free: opted in once, then automatic on every visit.
  const [alwaysListen, setAlwaysListen] = useState(loadAlwaysListen);
  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [tabVisible, setTabVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden,
  );

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { requireWakeRef.current = requireWake; }, [requireWake]);
  useEffect(() => { setCapability(detectCapability()); }, []);
  const supported = capability.recognition;

  // Read the permission once, then follow it: revoking the mic in browser
  // settings has to stop the assistant without a reload.
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const sync = () => { if (!cancelled) void micPermissionState().then(setPermission); };
    sync();
    (async () => {
      try {
        status = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
        status?.addEventListener('change', sync);
      } catch { /* Permissions API unavailable — the one read above stands */ }
    })();
    return () => { cancelled = true; status?.removeEventListener('change', sync); };
  }, []);

  // Stop when the tab goes away; pick up again when it returns.
  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /** The caller's area, only when they actually asked for "near me". */
  const resolveArea = useCallback(async (): Promise<string | null> => {
    if (!isGeolocationSupported()) return null;
    try {
      return (await detectLocation()).label;
    } catch {
      toast("Couldn't get your location - searching everywhere instead.");
      return null;
    }
  }, []);

  const runIntent = useCallback(async (command: string) => {
    const intent = parseVoiceCommand(command);

    if (intent.kind === 'navigate') {
      setReply(replyFor(intent));
      say(replyFor(intent));
      navigate(intent.path);
      setOpen(false);
      return;
    }

    if (intent.kind === 'unknown' || intent.kind === 'help') {
      const message = replyFor(intent);
      setReply(message);
      say(message);
      return;
    }

    // "What's open near me" — the question the product is named after, so it
    // lands on the directory already filtered rather than on a plain search.
    if (intent.kind === 'open-now') {
      setState('working');
      const where = intent.nearMe ? await resolveArea() : null;
      const message = replyFor(intent, where);
      setReply(message);
      say(message);
      const openQuery = intent.query ? matchCategory(intent.query) || intent.query : null;
      navigate(openNowUrl(openQuery, where));
      setOpen(false);
      return;
    }

    // Something about ONE named business. This is the part that makes it an
    // assistant rather than a search box: a yes-or-no question gets answered
    // out loud instead of handed back as a results page.
    if (intent.kind === 'business') {
      setState('working');
      setReply(replyFor(intent));
      if (intent.action !== 'status') say(replyFor(intent));

      const match = await findBusinessByName(intent.name);
      if (!match) {
        const message = notFoundReply(intent.name);
        setReply(message);
        say(message);
        navigate(searchUrlFor(intent.name));
        setOpen(false);
        return;
      }

      if (intent.action === 'call' && match.phone) {
        window.location.href = telHref(match.phone);
        setOpen(false);
        return;
      }
      if (intent.action === 'directions') {
        const where = match.location || match.name;
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`, '_blank', 'noopener');
        setOpen(false);
        return;
      }

      // Status — or a call to a business with no number on file, where the
      // useful thing is still whether they are open.
      const answer = spokenOpenState(match.name, publicOpenState(match, new Date()));
      setReply(answer);
      say(answer);
      setState('off');
      return;
    }

    // A search.
    setState('working');
    const location = intent.nearMe ? await resolveArea() : null;
    // Prefer a real platform category so the directory filters properly, and
    // fall back to the spoken words when nothing matches.
    const query = matchCategory(intent.query) || intent.query;
    const message = replyFor(intent, location);
    setReply(message);
    say(message);
    navigate(searchUrlFor(query, location));
    setOpen(false);
  }, [navigate, resolveArea]);

  const handleTranscript = useCallback((transcript: string) => {
    setHeard(transcript);
    const afterWake = stripWakePhrase(transcript);
    if (requireWakeRef.current) {
      // Not addressed to us — keep listening without acting.
      if (afterWake === null) return;
      if (!afterWake) {
        setReply('Listening…');
        return;
      }
      void runIntent(afterWake);
      return;
    }
    // Tap-to-talk: the tap was the activation, so a wake phrase is optional.
    void runIntent(afterWake ?? transcript);
  }, [runIntent]);

  const stop = useCallback(() => {
    setState('off');
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const start = useCallback(() => {
    const Recogniser = getRecogniser();
    if (!Recogniser) return;
    try { recognitionRef.current?.abort(); } catch { /* nothing running */ }
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

    const langs = languageChain(
      typeof navigator === 'undefined' ? undefined : navigator.language,
    );
    const recognition = new Recogniser();
    // Not every engine ships en-NG, and an unsupported tag can yield silence
    // rather than an error, so the chain steps down on 'language-not-supported'.
    recognition.lang = langs[Math.min(langIndexRef.current, langs.length - 1)];
    recognition.continuous = false; // ends on silence; restarted below
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        // A result means the microphone and the engine are both fine.
        attemptRef.current = 0;
        handleTranscript(transcript);
      }
    };

    recognition.onerror = (e) => {
      const verdict = classifyRecognitionError(e?.error);
      if (verdict.action === 'next-language') {
        langIndexRef.current = Math.min(langIndexRef.current + 1, langs.length - 1);
        return;
      }
      if (verdict.action === 'fatal') {
        keepListeningRef.current = false;
        setState('off');
        // Not closed: the panel stays open so the typed box is right there.
        setFallbackToTyping(true);
        if (verdict.message) toast.error(verdict.message);
        return;
      }
      if (verdict.action === 'retry') attemptRef.current += 1;
      // 'ignore' — a pause in speech. Not an error, and not counted.
    };

    recognition.onend = () => {
      // Recognition stops itself after every utterance and after silence. As
      // long as it should still be listening, restart it — that loop is what
      // makes hands-free work without the user touching anything.
      if (!keepListeningRef.current) { setState('off'); return; }

      if (shouldFallBackToTyping(attemptRef.current)) {
        // Six failures in a row is a broken microphone or a dead network, not a
        // blip. Stop burning battery on it and offer the box instead.
        keepListeningRef.current = false;
        setState('off');
        setFallbackToTyping(true);
        setReply('Could not hear you. Type your question instead.');
        return;
      }

      const wait = restartDelay(attemptRef.current);
      restartTimerRef.current = setTimeout(() => {
        try { recognition.start(); } catch { /* already restarting */ }
      }, wait);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setState('listening');
    } catch {
      setState('off');
    }
  }, [handleTranscript]);

  useEffect(() => () => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    try { recognitionRef.current?.abort(); } catch { /* gone */ }
  }, []);

  // The single source of truth for whether the microphone should be running.
  const wantListening = shouldListen({ alwaysListen, permission, tabVisible, panelOpen: open });
  useEffect(() => { keepListeningRef.current = wantListening; }, [wantListening]);

  // Drive the recogniser from that. This is what starts listening on page load
  // with no click at all, once hands-free is on and permission already granted.
  useEffect(() => {
    if (!supported) return;
    if (wantListening && state === 'off') {
      if (!open) setReply('Listening for “NowOpen AI”…');
      start();
    } else if (!wantListening && state !== 'off') {
      stop();
    }
    // `state` is intentionally read, not depended on, to avoid a start/stop loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantListening, supported]);

  const openPanel = (wake: boolean) => {
    // With hands-free on the user is already talking to a wake phrase; don't
    // silently switch them to tap-to-talk just because they opened the panel.
    const useWake = alwaysListen ? true : wake;
    setRequireWake(useWake);
    requireWakeRef.current = useWake;
    setHeard('');
    setReply(useWake ? 'Say “NowOpen AI…”' : 'Listening — what do you need?');
    setOpen(true);
    openRef.current = true;
    keepListeningRef.current = true;
    start();
  };

  const closePanel = () => {
    setOpen(false);
    openRef.current = false;
    // Closing the panel is not switching hands-free off — the effect below
    // decides whether the microphone stays live.
    if (!alwaysListen) {
      keepListeningRef.current = false;
      stop();
    }
  };

  // Deliberately no `if (!supported) return null`. The answer engine takes a
  // string, so a browser that cannot listen still gets the assistant — it just
  // reads the question instead of hearing it.

  return (
    <>
      {!open && (
        <button
          onClick={() => openPanel(false)}
          aria-label={!supported ? 'Ask NowOpen AI' : wantListening ? 'NowOpen AI is listening' : 'Voice search'}
          title={!supported
            ? 'Ask NowOpen AI'
            : wantListening
              ? 'Listening for “NowOpen AI” — tap to open'
              : 'Voice search — or say “NowOpen AI”'}
          className={`fixed bottom-24 right-5 z-40 w-[46px] h-[46px] rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition ${
            wantListening ? 'bg-red-600 text-white' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
          }`}
        >
          {/* A microphone on a device that cannot listen is a promise the page
              will not keep; show the keyboard it will actually use. */}
          {supported ? <Mic size={20} /> : <Keyboard size={20} />}
          {/* Standing indication that the mic is live — never listen silently. */}
          {wantListening && (
            <span className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping" aria-hidden />
          )}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6 flex justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Voice assistant"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`relative flex items-center justify-center w-10 h-10 rounded-full ${
                  state === 'listening' ? 'bg-red-600' : 'bg-gray-900 dark:bg-white'
                }`}>
                  {state === 'working'
                    ? <Loader2 size={18} className="text-white dark:text-gray-900 animate-spin" />
                    : supported
                      ? <Mic size={18} className="text-white dark:text-gray-900" />
                      : <Keyboard size={18} className="text-white dark:text-gray-900" />}
                  {state === 'listening' && (
                    <span className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">NowOpen AI</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {state === 'working'
                      ? 'Working…'
                      : state === 'listening'
                        ? 'Listening…'
                        : supported ? 'Paused' : 'Type to ask'}
                  </p>
                </div>
              </div>
              <button onClick={closePanel} aria-label="Close voice assistant"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm text-gray-900 dark:text-white min-h-[1.25rem]">
              {heard ? `“${heard}”` : reply}
            </p>
            {heard && reply && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{reply}</p>
            )}

            {/* Typing is always available, not just a fallback: it is faster in
                a noisy market, and it is the only input on a browser without
                recognition. Same engine either way. */}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const q = typed.trim();
                if (!q) return;
                setTyped('');
                setHeard(q);
                // Typing IS the activation, so no wake phrase is required.
                requireWakeRef.current = false;
                setRequireWake(false);
                void runIntent(q);
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={supported ? 'Or type your question' : 'Type your question'}
                aria-label="Ask NowOpen AI"
                autoFocus={!supported || fallbackToTyping}
                className="flex-1 min-w-0 px-3 min-h-[40px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
              <button
                type="submit"
                aria-label="Ask"
                className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90"
              >
                <Send size={15} />
              </button>
            </form>

            {/* What this particular device can do, said plainly rather than
                leaving somebody tapping a microphone that will never work. */}
            {capability.reason && (
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{capability.reason}</p>
            )}

            {/* Hands-free opt-in. The click both saves the preference and (on
                first use) grants the microphone, which is the one gesture the
                browser insists on — every later visit starts on its own. */}
            {capability.handsFree && (
            <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={alwaysListen}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAlwaysListen(on);
                  saveAlwaysListen(on);
                  if (on) {
                    setRequireWake(true);
                    requireWakeRef.current = true;
                    keepListeningRef.current = true;
                    start();
                  }
                }}
                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-xs font-semibold text-gray-900 dark:text-white">
                  Listen automatically for “NowOpen AI”
                </span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Starts on its own whenever NowOpen is open — no tapping. It can&apos;t
                  listen while your browser is closed, and it pauses when you switch tabs.
                </span>
                {permission === 'denied' && (
                  <span className="block text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    Microphone is blocked for this site — allow it in your browser settings first.
                  </span>
                )}
              </span>
            </label>
            )}

            {/* Speech controls only exist where speech does. */}
            {supported && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => { const next = !requireWake; setRequireWake(next); requireWakeRef.current = next; }}
                aria-pressed={requireWake}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  requireWake
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                }`}
              >
                <Ear size={13} /> {requireWake ? 'Wake phrase on' : 'Wake phrase off'}
              </button>
              {state === 'off' ? (
                <button onClick={start}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition">
                  <Mic size={13} /> Resume
                </button>
              ) : (
                <button onClick={stop}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                  <MicOff size={13} /> Pause
                </button>
              )}
            </div>
            )}

            <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
              Try “I need a barber in my area”, “find a wedding photographer”, or “open my dashboard”.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
