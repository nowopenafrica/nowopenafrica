import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface LiveAIAssistantProps {
  business: { name: string; category?: string; location?: string; description?: string };
}

export default function LiveAIAssistant({ business }: LiveAIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'greeting', role: 'assistant', content: `Hi! Ask me anything about ${business.name} — services, pricing, hours, you name it.` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          query: text,
          messages: history.filter((m) => m.id !== 'greeting').slice(-10).map((m) => ({ role: m.role, content: m.content })),
          business: {
            name: business.name,
            category: business.category,
            location: business.location,
            description: business.description,
          },
        }),
      });
      const data = await response.json();
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: data.message || "I couldn't process that." }]);
    } catch {
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: "Sorry, I couldn't reach the assistant just now." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
              m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm'
            }`}>
              {m.role === 'assistant' && m.id === 'greeting' && (
                <Sparkles size={12} className="inline mr-1 text-blue-500 dark:text-blue-400 -mt-0.5" />
              )}
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded-2xl rounded-bl-sm">
              <Loader2 size={14} className="animate-spin text-gray-500 dark:text-gray-400" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 p-2.5 flex gap-2 flex-shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Ask about this business…"
          className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex-shrink-0"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
