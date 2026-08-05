import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Send, Trash2, ShieldOff, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getSessionId, getSavedDisplayName, saveDisplayName } from '../../lib/liveStream';

interface ChatMessage {
  id: string;
  sender_name: string;
  sender_session: string;
  message: string;
  is_owner: boolean;
  is_system: boolean;
  hidden: boolean;
  created_at: string;
}

interface LiveChatProps {
  streamId: string;
  businessId: string;
  isOwner: boolean;
}

export default function LiveChat({ streamId, businessId, isOwner }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [name, setName] = useState(getSavedDisplayName());
  const [nameConfirmed, setNameConfirmed] = useState(!!getSavedDisplayName());
  const endRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(getSessionId());

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('stream_chat_messages')
      .select('*')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => { if (!cancelled && data) setMessages(data); });

    const channel = supabase
      .channel(`chat-rows:${streamId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stream_chat_messages', filter: `stream_id=eq.${streamId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stream_chat_messages', filter: `stream_id=eq.${streamId}` }, (payload) => {
        const updated = payload.new as ChatMessage;
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stream_chat_messages', filter: `stream_id=eq.${streamId}` }, (payload) => {
        const deletedId = (payload.old as ChatMessage).id;
        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [streamId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const visibleMessages = messages.filter((m) => !m.hidden || isOwner);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    if (!nameConfirmed) {
      if (!name.trim()) { toast.error('Enter a display name first'); return; }
      saveDisplayName(name.trim());
      setNameConfirmed(true);
    }
    setInput('');
    const { error } = await supabase.from('stream_chat_messages').insert([{
      stream_id: streamId,
      sender_name: (name || 'Guest').trim() || 'Guest',
      sender_session: sessionId.current,
      message: text,
      is_owner: isOwner,
    }]);
    if (error) {
      toast.error(error.message.includes('row-level security') ? "You've been blocked from chatting here." : `Message failed: ${error.message}`);
    }
  };

  const hideMessage = async (id: string) => {
    await supabase.from('stream_chat_messages').update({ hidden: true }).eq('id', id);
  };

  const blockSender = async (senderSession: string) => {
    if (!window.confirm('Block this viewer from chatting in your streams?')) return;
    const { error } = await supabase.from('stream_blocked_senders').insert([{ business_id: businessId, session_id: senderSession }]);
    if (error && !error.message.includes('duplicate')) {
      toast.error(`Could not block: ${error.message}`);
      return;
    }
    toast.success('Viewer blocked');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {visibleMessages.length === 0 && (
          <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-6 flex flex-col items-center gap-2">
            <MessageCircle size={20} />
            Be the first to say something!
          </div>
        )}
        {visibleMessages.map((m) => (
          <div key={m.id} className={`group flex items-start gap-2 text-xs ${m.hidden ? 'opacity-40' : ''}`}>
            <div className="flex-1 min-w-0">
              <span className={`font-semibold ${m.is_owner ? 'text-purple-600 dark:text-purple-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {m.sender_name}{m.is_owner && ' 👑'}
              </span>{' '}
              <span className="text-gray-600 dark:text-gray-400 break-words">{m.message}</span>
              {m.hidden && isOwner && <span className="ml-1 text-[10px] text-red-500">(hidden)</span>}
            </div>
            {isOwner && !m.is_owner && (
              <div className="flex-shrink-0 hidden group-hover:flex gap-1">
                <button onClick={() => hideMessage(m.id)} title="Hide message" className="text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                  <Trash2 size={12} />
                </button>
                <button onClick={() => blockSender(m.sender_session)} title="Block this viewer" className="text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                  <ShieldOff size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 p-2.5 flex-shrink-0 space-y-1.5">
        {!nameConfirmed && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Your name"
            className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Say something…"
            maxLength={500}
            className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button onClick={send} disabled={!input.trim()} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex-shrink-0">
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
