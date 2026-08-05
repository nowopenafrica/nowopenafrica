import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Bot, User as UserIcon, ArrowRight } from 'lucide-react';
import { Business } from '../../types';
import { assistantReply, AssistantAction } from '../../lib/assistant';
import { GrowthPlanModule } from '../../lib/growth';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
  title?: string;
  subtitle?: string;
  quickPrompts?: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  actions?: AssistantAction[];
}

const QUICK_PROMPTS = [
  'Write a caption for a weekend offer',
  'What promotions should I run?',
  'Plan me a 7-day campaign',
  'How do I improve my growth score?',
  'Rewrite my description',
];

function initialGreeting(business: Business): ChatMessage[] {
  return [{
    role: 'assistant',
    text: [
      `Hey! I am the AI Business Assistant for ${business.name}.`,
      '',
      'I write captions, plan campaigns, suggest promotions, draft quotes, explain your sales and track your growth — all from your profile.',
      '',
      'Try one of the suggestions below, or just ask me anything about your business.',
    ].join('\n'),
    actions: [
      { label: 'Write a caption', module: 'copywriter' },
      { label: 'Promo ideas', module: 'promotions' },
      { label: 'Check my growth score', module: 'health' },
    ],
  }];
}

export default function MarketingAssistant({ business, onNavigate, title = 'AI Business Assistant', subtitle = 'Powered by your business profile · instant & free', quickPrompts = QUICK_PROMPTS }: Props) {
  const storageKey = `nowopen_assistant_${business.id}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : null;
      return parsed && parsed.length ? parsed : initialGreeting(business);
    } catch {
      return initialGreeting(business);
    }
  });
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  const persist = (next: ChatMessage[]) => {
    setMessages(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    const userMsg: ChatMessage = { role: 'user', text };
    persist([...messages, userMsg]);
    setInput('');
    setThinking(true);
    // Tiny delay so the reply feels like a real assistant.
    setTimeout(() => {
      const reply = assistantReply(business, text);
      setMessages((prev) => {
        const replyMsg: ChatMessage = { role: 'assistant', text: reply.text, actions: reply.actions };
        const next = [...prev, replyMsg];
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      setThinking(false);
    }, 350);
  };

  const clear = () => {
    persist(initialGreeting(business));
  };

  return (
    <div className="flex flex-col h-[620px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
          <Bot size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold leading-tight">{title}</h2>
          <p className="text-[11px] opacity-80 truncate">{subtitle}</p>
        </div>
        <button onClick={clear} className="text-[11px] font-medium bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-lg transition">
          New chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={14} className="text-purple-600 dark:text-purple-400" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user'
              ? 'bg-purple-600 text-white rounded-br-sm'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm'}`}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.actions && m.actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {m.actions.map((a) => (
                    <button key={a.label} onClick={() => onNavigate(a.module)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-purple-300 dark:hover:border-purple-500">
                      {a.label} <ArrowRight size={11} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 mt-0.5">
                <UserIcon size={14} className="text-blue-600 dark:text-blue-400" />
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-purple-600 dark:text-purple-400 animate-pulse" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-3 flex gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts + input */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {quickPrompts.map((p) => (
            <button key={p} onClick={() => ask(p)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 transition">
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(input); }}
            placeholder="Ask me anything — e.g. “write a caption for my new product”"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button onClick={() => ask(input)} disabled={!input.trim() || thinking}
            className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
