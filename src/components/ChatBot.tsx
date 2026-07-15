import { useState, useRef, useEffect, useMemo, type ReactNode, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageCircle, Send, X, Minimize2, Maximize2, Loader2, Sparkles, Trash2, RotateCcw,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

const STORAGE_KEY = 'nowopen_chat_messages';
const SEEN_KEY = 'nowopen_chat_seen';
const MAX_INPUT_LENGTH = 1000;

const GREETING: Message = {
  id: 'greeting',
  role: 'assistant',
  content:
    "Hi! I'm the NowOpen Africa assistant. I can look up real businesses, ad placements, and creative services on the platform — ask me anything.",
};

const SUGGESTIONS = [
  'Find tech businesses in Nairobi',
  'How much is a billboard in Lagos?',
  'What creative services do you offer?',
  'Tell me about pricing plans',
];

// ---- tiny markdown-lite renderer (bold, links, bullet lists) --------------
// Deliberately not a full markdown library — the assistant is instructed to
// use only these constructs, so a small hand-rolled parser keeps the bundle
// light and avoids an extra dependency for a handful of tags.

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter((p) => p !== '');
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={`${keyPrefix}-b-${i}`}>{bold[1]}</strong>;

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      const className = 'text-blue-600 underline decoration-blue-300 hover:text-blue-800 font-medium';
      return href.startsWith('/') ? (
        <Link key={`${keyPrefix}-l-${i}`} to={href} className={className}>{label}</Link>
      ) : (
        <a key={`${keyPrefix}-l-${i}`} href={href} target="_blank" rel="noopener noreferrer" className={className}>{label}</a>
      );
    }
    return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
  });
}

function renderMarkdown(content: string): ReactNode {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${key}`} className="list-disc pl-4 my-1 space-y-0.5">
        {list.map((item, i) => <li key={i}>{parseInline(item, `${key}-li-${i}`)}</li>)}
      </ul>
    );
    list = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ''));
    } else {
      flushList(String(idx));
      if (trimmed) blocks.push(<p key={`p-${idx}`} className="mb-1 last:mb-0">{parseInline(line, `p${idx}`)}</p>);
    }
  });
  flushList('end');

  return <>{blocks}</>;
}

// Reveals an assistant reply word-by-word for a livelier feel, then swaps to
// the fully-formatted markdown once done. Historical messages (loaded from
// sessionStorage) skip straight to the formatted version via `animate=false`.
function AssistantText({ text, animate, onTick, onDone }: {
  text: string;
  animate: boolean;
  onTick: () => void;
  onDone: () => void;
}) {
  const words = useMemo(() => text.split(' '), [text]);
  const [count, setCount] = useState(animate ? 0 : words.length);

  useEffect(() => {
    if (!animate) return;
    if (words.length === 0) { onDone(); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      onTick();
      if (i >= words.length) {
        clearInterval(id);
        onDone();
      }
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, animate]);

  if (count < words.length) {
    return <span className="whitespace-pre-wrap">{words.slice(0, count).join(' ')}</span>;
  }
  return <div className="text-sm leading-relaxed">{renderMarkdown(text)}</div>;
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore malformed storage
    }
    return [GREETING];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [hasSeenWidget, setHasSeenWidget] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
  });

  const lastUserQueryRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });

  useEffect(() => { scrollToBottom(); }, [messages.length]);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch { /* storage may be unavailable */ }
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      textareaRef.current?.focus();
      if (!hasSeenWidget) {
        try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
        setHasSeenWidget(true);
      }
    }
  }, [isOpen, isMinimized, hasSeenWidget]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;

    lastUserQueryRef.current = text;
    const historyForRequest = messages; // snapshot before appending the new turn

    const userMessage: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    requestAnimationFrame(autoResize);
    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/chatbot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ query: text, messages: historyForRequest }),
      });

      const data = await response.json();
      const assistantId = `a-${Date.now()}`;
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: data.message || "I couldn't process that request.",
        error: !response.ok,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (response.ok && !prefersReducedMotion) setRevealingId(assistantId);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: "Sorry, I couldn't reach the assistant. Check your connection and try again.", error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = () => {
    setMessages([GREETING]);
    setRevealingId(null);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition flex items-center justify-center z-50"
        title="Chat with the NowOpen assistant"
      >
        <MessageCircle size={24} />
        {!hasSeenWidget && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-yellow-400 border-2 border-white" />
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200 overflow-hidden transition-[height] duration-200 ${
        isMinimized ? 'h-auto' : 'h-[600px] max-h-[calc(100vh-7rem)]'
      }`}
    >
      <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm leading-tight truncate">NowOpen Assistant</h3>
            <p className="text-[11px] text-blue-100 leading-tight truncate">Businesses · ads · pricing</p>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={clearConversation} className="hover:bg-blue-700 p-1.5 rounded transition" title="Clear conversation">
            <Trash2 size={16} />
          </button>
          <button onClick={() => setIsMinimized(!isMinimized)} className="hover:bg-blue-700 p-1.5 rounded transition" title={isMinimized ? 'Expand' : 'Minimize'}>
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 p-1.5 rounded transition" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : message.error
                      ? 'bg-red-50 text-red-800 border border-red-200 rounded-bl-sm'
                      : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <AssistantText
                      text={message.content}
                      animate={message.id === revealingId}
                      onTick={scrollToBottom}
                      onDone={() => setRevealingId((cur) => (cur === message.id ? null : cur))}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  )}
                  {message.error && (
                    <button
                      onClick={() => sendMessage(lastUserQueryRef.current)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900"
                    >
                      <RotateCcw size={12} />
                      Try again
                    </button>
                  )}
                </div>
              </div>
            ))}

            {messages.length === 1 && !loading && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 transition border border-blue-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.12s' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.24s' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-200 p-3 flex gap-2 items-end flex-shrink-0">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder="Ask about businesses, ads, pricing…"
              rows={1}
              maxLength={MAX_INPUT_LENGTH}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-[120px] leading-normal"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title="Send"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
