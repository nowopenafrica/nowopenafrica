import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Bot, Plus, Send, Archive, ShieldCheck, Loader2, Sparkles, Activity, Lock,
  GitMerge, CheckCircle2, XCircle, Clock, Wrench, ListChecks, RefreshCw, Trash2, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { planFor } from '../../lib/aiCommand/router';
import { buildLlmPayload, type ToolEvidence } from '../../lib/aiCommand/prompts';
import {
  AI_TOOLS, READ_TOOLS, REQUIRES_APPROVAL, riskLabel, riskTone, roleMayRun,
} from '../../lib/aiCommand/tools';
import { AI_AGENTS } from '../../lib/aiCommand/agents';
import {
  aiRunTool, aiLlm, aiSessionsList, aiSessionCreate, aiSessionGet, aiSessionArchive, aiSessionAppend, aiSessionDelete,
  aiOpenCodeCreate, aiOpenCodeRun, aiOpenCodeStream,
  type OpenCodeStreamEvent,
} from '../../lib/aiCommand/client';
import {
  AUTONOMY_LABEL, type AppMessage, type RoutePlan, type SessionSummary,
} from '../../lib/aiCommand/types';
import {
  AI_MODEL_GROUPS, loadPreferredModel, persistPreferredModel,
} from '../../lib/aiCommand/models';
import { renderMarkdown } from '../../lib/markdownLite';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

let fallbackId = 0;
const uid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `m-${++fallbackId}`;

const SHORT_TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

const QUICK_ACTIONS = [
  'Audit NowOpen today — health, claims, growth.',
  'Why are businesses not claiming? What is stuck in review?',
  'Find our best acquisition opportunities right now.',
  'What data quality gaps and duplicates should we fix first?',
  'Show me the RLS security snapshot.',
  'Where is demand outrunning our listings?',
];

/** Which engine drives sessions. Prod stays 'builtin' until the OpenCode
 *  server is deployed and its secrets are on the edge function. */
const AI_ENGINE: 'builtin' | 'opencode' = import.meta.env.VITE_AI_ENGINE ?? 'builtin';

interface RawMessage {
  id: string;
  role: string;
  agent: string | null;
  content: Record<string, unknown>;
  created_at: string;
}

function mapMessages(rows: RawMessage[]): AppMessage[] {
  return rows.map((m) => ({
    id: m.id,
    role: (['user', 'assistant', 'step', 'tool', 'system'].includes(m.role) ? m.role : 'system') as AppMessage['role'],
    agent: m.agent,
    content: m.content as AppMessage['content'],
    createdAt: m.created_at,
  }));
}

// ---------------------------------------------------------------------------
// small presentational pieces
// ---------------------------------------------------------------------------

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${tone}`}>
      {children}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  return <Badge tone={riskTone(risk as Parameters<typeof riskTone>[0])}>{riskLabel(risk as Parameters<typeof riskLabel>[0])}</Badge>;
}

/** Render a bounded tool result: objects as kv rows, arrays as a table. */
function ResultView({ value }: { value: unknown }) {
  const text = JSON.stringify(value);
  if (!text || text === '{}') return <p className="text-xs text-gray-400">(no result)</p>;
  if (text.length <= 320) return <pre className="text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{text}</pre>;

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
    const rows = (value as Record<string, unknown>[]).slice(0, 10);
    const keys = Object.keys(rows[0]).slice(0, 7);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-200 dark:border-gray-700">
              {keys.map((k) => <th key={k} className="py-1 pr-3 font-medium">{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                {keys.map((k) => (
                  <td key={k} className="py-1 pr-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
                    {String(r[k] ?? '').slice(0, 60)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {value.length > rows.length && <p className="text-[10px] text-gray-400 mt-1">Showing {rows.length} of {value.length}</p>}
      </div>
    );
  }
  return <pre className="text-[11px] leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{text.slice(0, 1600)}{text.length > 1600 ? '…' : ''}</pre>;
}

function ToolCard({ message }: { message: AppMessage }) {
  const c = message.content;
  const tool = AI_TOOLS.find((t) => t.name === c.tool_name);
  const running = c.status === 'running';
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <Wrench className="h-3.5 w-3.5 text-purple-500" />
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{tool?.label ?? c.tool_name}</span>
        <span className="ml-auto flex items-center gap-2">
          {c.read_only !== false && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Lock className="h-3 w-3" /> read-only</span>}
          <RiskBadge risk={c.risk ?? 'READ'} />
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-500" />
          ) : c.status === 'executed' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          )}
        </span>
      </div>
      <div className="px-3 py-2">
        {running
          ? <p className="text-xs text-gray-400 animate-pulse">Querying real data…</p>
          : c.error
            ? <p className="text-xs text-red-600 dark:text-red-400">{c.error}</p>
            : <ResultView value={c.result} />}
        {typeof c.duration_ms === 'number' && c.status !== 'running' && (
          <p className="text-[10px] text-gray-400 mt-1">{c.duration_ms} ms</p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AppMessage }) {
  if (message.role === 'tool') return <ToolCard message={message} />;
  if (message.role === 'step') {
    return (
      <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="font-medium">{message.content.text ?? 'Planning…'}</span>
        {message.content.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
    );
  }
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-purple-600 text-white px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
          {message.content.text}
        </div>
      </div>
    );
  }
  if (message.role === 'assistant') {
    const pending = message.content.status === 'running';
    return (
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          {message.content.agent && <p className="text-[10px] font-medium text-purple-500 mb-0.5">{message.content.agent}</p>}
          <div className="rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200">
            {pending && !message.content.text
              ? <span className="flex items-center gap-2 text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Synthesising from the evidence above…</span>
              : pending
                ? <p className="whitespace-pre-wrap break-words">{message.content.text}<span className="inline-block h-3.5 w-0.5 ml-0.5 align-middle bg-purple-400 animate-pulse" /></p>
                : <div className="text-sm leading-relaxed">{renderMarkdown(message.content.text || '(empty reply)')}</div>}
          </div>
          {message.content.provider && message.content.provider !== 'none' && (
            <p className="text-[10px] text-gray-400 mt-1">model: {message.content.provider} {message.content.model ?? ''}</p>
          )}
          {message.content.ok === false && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">No model was reachable — the tool evidence above is the real answer.</p>
          )}
        </div>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// main workspace
// ---------------------------------------------------------------------------

export default function AiCommandCenter({ onOpenSection }: { onOpenSection: (id: string) => void }) {
  void onOpenSection;
  const { user: authUser } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState('New session');
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offlineReason, setOfflineReason] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [prepared, setPrepared] = useState<{ name: string; reason: string }[]>([]);
  const [model, setModel] = useState<string>(() => loadPreferredModel());
  const [liveEvent, setLiveEvent] = useState<OpenCodeStreamEvent | null>(null);
  const [showQuickActions, setShowQuickActions] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nowopen_ai_command_quick') !== 'off';
    } catch {
      return true;
    }
  });
  // Tool evidence cards are honest but noisy — collapsed by default, so the
  // chat reads like a conversation unless the user wants the receipts.
  const [toolsCollapsed, setToolsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nowopen_ai_command_tools') !== 'on';
    } catch {
      return true;
    }
  });
  const streamAbort = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const toggleQuickActions = useCallback(() => {
    setShowQuickActions((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nowopen_ai_command_quick', next ? 'on' : 'off');
      } catch {
        // preference just won't survive a reload
      }
      return next;
    });
  }, []);

  const toggleTools = useCallback(() => {
    setToolsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nowopen_ai_command_tools', next ? 'on' : 'off');
      } catch {
        // preference just won't survive a reload
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    void supabase.from('users').select('role').eq('id', authUser.id).maybeSingle().then(({ data }) => setRole(data?.role ?? null));
  }, [authUser]);

  const loadSessions = useCallback(async () => {
    try {
      const { sessions: list } = await aiSessionsList();
      setSessions(list.filter((s) => s.status === 'active'));
      setOffline(false);
      setOfflineReason(null);
    } catch (e) {
      setOffline(true);
      setOfflineReason(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (authUser && !booted) {
      void loadSessions().finally(() => setBooted(true));
    }
  }, [authUser, booted, loadSessions]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, running]);

  const openSession = useCallback(async (id: string) => {
    setActiveId(id);
    setPlan(null);
    try {
      const detail = await aiSessionGet(id);
      setActiveTitle(detail.session.title);
      setSessions((prev) => prev.map((s) => (s.id === id ? detail.session : s)));
      setMessages(mapMessages(detail.messages));
      // Restore the engine model the session's last reply actually used, so an
      // opencode session re-opens on its own model rather than the global pick.
      const used = [...detail.messages].reverse().find((m) => m.role === 'assistant' && typeof m.content?.model === 'string' && (m.content.model as string).startsWith('opencode/'));
      if (used && typeof used.content.model === 'string') {
        setModel(used.content.model as string);
      }
    } catch {
      toast.error('Could not load the session.');
    }
  }, []);

  const ensureSession = useCallback(async (titleHint: string): Promise<string> => {
    if (activeId) return activeId;
    const { session } = await aiSessionCreate(titleHint.slice(0, 60));
    setActiveId(session.id);
    setActiveTitle(session.title);
    setSessions((prev) => [
      { id: session.id, title: session.title, agent_ids: [], autonomy_level: 2, status: 'active', updated_at: new Date().toISOString(), created_at: new Date().toISOString(), summary: {} },
      ...prev,
    ]);
    return session.id;
  }, [activeId]);

  const send = useCallback(async (raw?: string) => {
    const prompt = (raw ?? input).trim();
    if (!prompt || running) return;
    setInput('');
    setRunning(true);
    setPlan(null);

    const userMsg: AppMessage = { id: uid(), role: 'user', content: { text: prompt }, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    if (AI_ENGINE === 'opencode') {
      try {
        // The edge function owns session creation for engine=opencode rows: it
        // makes the NowOpen row, links the upstream OpenCode session, and
        // answers with both. No separate aiSessionCreate here.
        let sessionId = activeId;
        let ocModel = model;
        if (!sessionId) {
          const created = await aiOpenCodeCreate(prompt.slice(0, 60), ocModel);
          const createdId = created.session.id;
          sessionId = createdId;
          ocModel = created.model;
          setActiveId(createdId);
          setActiveTitle(created.session.title);
          setSessions((prev) => [
            {
              id: createdId, title: created.session.title, agent_ids: [], autonomy_level: 2,
              status: 'active', updated_at: new Date().toISOString(), created_at: new Date().toISOString(),
              summary: {}, engine: 'opencode', opencode_session_id: created.opencodeSessionId,
            },
            ...prev,
          ]);
        }

        const replyMsg: AppMessage = {
          id: uid(), role: 'assistant', content: { status: 'running', engine: 'opencode' },
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, replyMsg]);

        // Live SSE while the engine works (text streams into the reply, tool
        // and reasoning steps surface as a chip); abort when the turn resolves.
        const ac = new AbortController();
        streamAbort.current = ac;
        const streamPromise = aiOpenCodeStream(sessionId, (ev) => {
          if (ev.sessionID && ev.sessionID !== sessionId) return;
          setLiveEvent(ev);
          if (ev.type === 'message.part.updated' && ev.part?.type === 'text' && typeof ev.part.text === 'string' && ev.part.text) {
            setMessages((prev) => prev.map((m) => (m.id === replyMsg.id
              ? { ...m, content: { ...m.content, text: ev.part?.text, status: 'running', engine: 'opencode' } }
              : m)));
          }
        }).catch(() => undefined);

        let run: { text: string; model: string; durationMs: number };
        try {
          run = await aiOpenCodeRun(sessionId, prompt, ocModel);
        } finally {
          ac.abort();
          streamAbort.current = null;
          setLiveEvent(null);
          await streamPromise;
        }

        setMessages((prev) => prev.map((m) => (m.id === replyMsg.id
          ? { ...m, content: { text: run.text || '(empty reply)', status: 'done', engine: 'opencode', model: run.model, duration_ms: run.durationMs } }
          : m)));

        // The server mirrored reply + tool steps into the NowOpen stream;
        // re-pull so the thread shows them all.
        const detail = await aiSessionGet(sessionId);
        setMessages(mapMessages(detail.messages));
        const { sessions: refreshed } = await aiSessionsList();
        setSessions(refreshed.filter((s) => s.status === 'active'));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'OpenAI Code Center could not complete that run.');
        setMessages((prev) => [...prev, {
          id: uid(), role: 'step',
          content: { text: e instanceof Error ? e.message : 'The OpenCode engine did not respond. Nothing was simulated.', engine: 'opencode' },
          createdAt: new Date().toISOString(),
        }]);
      } finally {
        setRunning(false);
      }
      return;
    }

    const route = planFor(prompt);
    setPlan(route);
    const agentName = AI_AGENTS.find((a) => a.id === route.agents[0])?.name ?? 'Agent';

    const stepMsg: AppMessage = {
      id: uid(), role: 'step', agent: route.agents[0],
      content: { text: `${agentName} — running: ${route.tools.map((t) => t.tool).join(', ')}`, status: 'running' },
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, stepMsg]);

    const evidence: ToolEvidence[] = [];
    try {
      const sessionId = await ensureSession(prompt);
      await aiSessionAppend(sessionId, 'user', { text: prompt });
      await aiSessionAppend(sessionId, 'step', { text: stepMsg.content.text }, route.agents[0]);

      for (const toolPlan of route.tools) {
        const toolCard: AppMessage = {
          id: uid(), role: 'tool',
          content: { tool_name: toolPlan.tool, risk: 'READ', read_only: true, status: 'running' },
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, toolCard]);
        const started = Date.now();
        try {
          const res = await aiRunTool({ sessionId, toolName: toolPlan.tool, args: toolPlan.args });
          const done: AppMessage = {
            id: toolCard.id, role: 'tool',
            content: {
              tool_name: toolPlan.tool, risk: res.risk as never, read_only: res.readOnly,
              status: res.status, result: res.result, error: res.error,
              duration_ms: res.durationMs ?? Date.now() - started,
            },
            createdAt: toolCard.createdAt,
          };
          setMessages((prev) => prev.map((m) => (m.id === toolCard.id ? done : m)));
          evidence.push({ tool: toolPlan.tool, result: res.result ?? { ok: res.ok }, error: res.error });
        } catch (e) {
          const failed: AppMessage = {
            id: toolCard.id, role: 'tool',
            content: { tool_name: toolPlan.tool, risk: 'READ', read_only: true, status: 'failed', error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - started },
            createdAt: toolCard.createdAt,
          };
          setMessages((prev) => prev.map((m) => (m.id === toolCard.id ? failed : m)));
          evidence.push({ tool: toolPlan.tool, result: null, error: e instanceof Error ? e.message : String(e) });
        }
      }

      setMessages((prev) => prev.map((m) => (m.id === stepMsg.id ? { ...m, content: { ...m.content, status: 'done' } } : m)));

      const { system, turns } = buildLlmPayload({ prompt, plan: route, evidence });
      const replyMsg: AppMessage = {
        id: uid(), role: 'assistant', agent: agentName,
        content: { status: 'running' }, createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, replyMsg]);
      try {
        const llm = await aiLlm({ sessionId, agent: agentName, system, turns, model });
        const doneReply: AppMessage = {
          id: replyMsg.id, role: 'assistant', agent: agentName,
          content: {
            text: llm.ok ? llm.text ?? '(empty reply)' : undefined,
            ok: llm.ok, provider: llm.provider, model: llm.model,
            status: 'done', duration_ms: llm.durationMs,
          },
          createdAt: replyMsg.createdAt,
        };
        setMessages((prev) => prev.map((m) => (m.id === replyMsg.id ? doneReply : m)));
        if (!llm.ok) {
          setMessages((prev) => [...prev, {
            id: uid(), role: 'step',
            content: { text: 'No LLM provider is configured or reachable right now — the tool results above are the real answer.' },
            createdAt: new Date().toISOString(),
          }]);
        }
      } catch (_e) {
        setMessages((prev) => prev.map((m) => (m.id === replyMsg.id
          ? { ...m, content: { ...m.content, status: 'done', text: 'Model synthesis failed — the tool evidence above stands on its own.' } }
          : m)));
      }

      const { sessions: refreshed } = await aiSessionsList();
      setSessions(refreshed.filter((s) => s.status === 'active'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'OpenAI Code Center could not complete that run.');
      setMessages((prev) => [...prev, {
        id: uid(), role: 'step',
        content: { text: e instanceof Error ? e.message : 'The edge function was not reachable. The tool list below is still available for reference.' },
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setRunning(false);
    }
  }, [input, running, ensureSession, activeId, model]);

  const archiveActive = useCallback(async () => {
    if (!activeId) return;
    try {
      await aiSessionArchive(activeId);
      setSessions((prev) => prev.filter((s) => s.id !== activeId));
      setActiveId(null);
      setActiveTitle('New session');
      setMessages([]);
      setPlan(null);
    } catch {
      toast.error('Could not archive the session.');
    }
  }, [activeId]);

  const deleteActive = useCallback(async () => {
    if (!activeId) return;
    if (!window.confirm('Delete this session permanently? Its messages, tool runs and approvals go with it.')) return;
    try {
      await aiSessionDelete(activeId);
      setSessions((prev) => prev.filter((s) => s.id !== activeId));
      setActiveId(null);
      setActiveTitle('New session');
      setMessages([]);
      setPlan(null);
      toast.success('Session deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the session.');
    }
  }, [activeId]);

  const prepare = useCallback(async () => {
    const toolNames = REQUIRES_APPROVAL.map((t) => t.name);
    setPrepared(toolNames.map((name) => ({ name, reason: 'LEVEL 2 PREPARE — registered, not executed.' })));
    toast('Registered for Phase 2 approval flow — nothing executes at Level 2 Prepare.');
  }, []);

  const quickRun = useCallback((q: string) => { void send(q); }, [send]);

  const canRun = (name: string): boolean => {
    const tool = AI_TOOLS.find((t) => t.name === name);
    return tool ? roleMayRun(role, tool) : true;
  };

  const liveEventLabel = (ev: OpenCodeStreamEvent | null): string => {
    if (!ev) return 'working';
    if (ev.part?.type === 'tool') return `tool: ${ev.part.tool ?? 'nowopen'}`;
    if (ev.part?.type === 'reasoning') return 'reasoning…';
    if (ev.type === 'message.updated' && ev.info?.modelID) return `model: ${ev.info.modelID}`;
    return ev.type;
  };

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 shrink-0">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">OpenAI Code Center</p>
          <p className="text-[11px] text-gray-400 truncate">{activeTitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone="bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            <ShieldCheck className="h-3 w-3" /> {AUTONOMY_LABEL}
          </Badge>
          <Badge tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <Lock className="h-3 w-3" /> read-only tools
          </Badge>
          {activeId && (
            <>
              <button onClick={() => void archiveActive()} className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" title="Archive session">
                <Archive className="h-3.5 w-3.5" /> Archive
              </button>
              <button onClick={() => void deleteActive()} className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/60 px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300" title="Delete session permanently">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      {offline && (
        <div className="flex items-start gap-2 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-xs text-amber-700 dark:text-amber-300 shrink-0">
          <Activity className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Edge function not reachable.</p>
            <p className="opacity-90">Runs need <code className="font-mono">ai-command</code> deployed (Supabase). The available tools and this workspace remain on screen; nothing is simulated.</p>
            {offlineReason && (
              <p className="mt-1 break-words font-mono text-[10px] text-amber-800 dark:text-amber-200 opacity-90">Error: {offlineReason}</p>
            )}
            <button onClick={() => void loadSessions()} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 px-2.5 py-1 text-[11px] font-medium hover:bg-amber-100 dark:hover:bg-amber-950/60 transition">
              <RefreshCw className="h-3 w-3" /> Retry connection
            </button>
          </div>
        </div>
      )}

      <div className="grid flex-1 min-h-0 lg:grid-cols-[220px_1fr_280px]">
        {/* rail */}
        <aside className="hidden lg:flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-0">
          <button onClick={() => { setActiveId(null); setActiveTitle('New session'); setMessages([]); setPlan(null); }}
            className="flex items-center justify-center gap-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/50 px-3 py-2.5 text-sm font-medium text-purple-700 dark:text-purple-300 m-3 hover:bg-purple-100 dark:hover:bg-purple-950">
            <Plus className="h-4 w-4" /> New session
          </button>
          <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
            {sessions.map((s) => (
              <button key={s.id} onClick={() => void openSession(s.id)}
                className={`w-full text-left rounded-xl px-3 py-2.5 mb-1.5 transition ${s.id === activeId ? 'bg-purple-50 dark:bg-purple-950/60 ring-1 ring-purple-200 dark:ring-purple-800' : 'hover:bg-gray-50 dark:hover:bg-gray-900'}`}>
                <p className={`text-xs font-medium truncate ${s.id === activeId ? 'text-purple-700 dark:text-purple-300' : 'text-gray-800 dark:text-gray-200'}`}>{s.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                  {SHORT_TIME.format(new Date(s.updated_at))}
                  {s.engine === 'opencode' && <span className="inline-flex items-center gap-0.5 rounded bg-fuchsia-50 dark:bg-fuchsia-950/60 px-1 text-[9px] font-medium text-fuchsia-600 dark:text-fuchsia-400"><Bot className="h-2.5 w-2.5" /> opencode</span>}
                </p>
              </button>
            ))}
            {!sessions.length && !offline && (
              <p className="text-[11px] text-gray-400 text-center mt-6 px-2">No sessions yet. Ask something and it will appear here.</p>
            )}
          </div>
        </aside>

        {/* thread */}
        <section className="flex flex-col min-h-0 min-w-0">
          <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
            {messages.length === 0 && !running && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white flex items-center justify-center gap-2">
                    Ask the platform anything.
                    <button
                      type="button"
                      onClick={toggleQuickActions}
                      title={showQuickActions ? 'Hide suggestion chips' : 'Show suggestion chips'}
                      className="rounded-full border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
                    >
                      {showQuickActions ? 'hide suggestions' : 'suggestions'}
                    </button>
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                    Real tool runs against NowOpen data, then a real model brief. Level 2 Prepare — every tool is read-only; nothing changes.
                  </p>
                </div>
                {showQuickActions && (
                  <div className="grid sm:grid-cols-2 gap-2 max-w-xl w-full">
                    {QUICK_ACTIONS.map((q) => (
                      <button key={q} onClick={() => quickRun(q)}
                        className="text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-700 transition">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.some((m) => m.role === 'tool') && !toolsCollapsed && (
              <button
                type="button"
                onClick={toggleTools}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition"
                title="Collapse tool evidence"
              >
                <ChevronDown className="h-3 w-3 rotate-180" /> collapse tool evidence
              </button>
            )}
            {messages.map((m, i) => {
              if (m.role === 'tool' && toolsCollapsed) {
                // One slim pill in place of the whole stack of tool cards.
                if (i > 0 && messages[i - 1].role === 'tool') return null;
                const toolCount = messages.filter((x) => x.role === 'tool').length;
                const toolLabels = [...new Set(messages
                  .filter((x) => x.role === 'tool')
                  .map((x) => AI_TOOLS.find((t) => t.name === x.content.tool_name)?.label ?? x.content.tool_name ?? 'tool'))];
                return (
                  <button
                    key={`toolgate-${i}`}
                    type="button"
                    onClick={toggleTools}
                    className="w-full text-left rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/40 px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 hover:border-purple-300 dark:hover:border-purple-700 hover:text-gray-700 dark:hover:text-gray-200 transition flex items-center gap-2"
                    title="Show tool evidence"
                  >
                    <Wrench className="h-3.5 w-3.5 text-purple-500" />
                    <span>{toolCount} {toolCount === 1 ? 'tool ran' : 'tools ran'}: {toolLabels.join(', ')}</span>
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Lock className="h-3 w-3" /> read-only</span>
                    <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                  </button>
                );
              }
              return <MessageBubble key={m.id} message={m} />;
            })}
            {running && messages.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400 pl-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {AI_ENGINE === 'opencode'
                  ? <span>opencode · <span className="text-purple-500">{liveEventLabel(liveEvent)}</span>…</span>
                  : <span>working…</span>}
              </div>
            )}
          </div>

          {/* composer */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shrink-0">
            <div className="flex items-end gap-2">
              <select
                  value={model}
                  onChange={(e) => { const next = e.target.value; setModel(next); persistPreferredModel(next); }}
                  disabled={running}
                  title="Engine model"
                  className="shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2.5 py-2.5 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {AI_MODEL_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.models.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={2}
                placeholder="Ask about businesses, claims, growth, quality, security…"
                className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={() => void send()}
                disabled={running || !input.trim()}
                className="flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-white min-h-[44px]"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="hidden sm:inline">{running ? 'Running' : 'Run'}</span>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              {AI_ENGINE === 'opencode'
                ? `OpenCode engine · ${model}. Every tool run stays read-only and records an audit trail.`
                : `Model ${model} — used when OpenCode Zen is at the gateway; otherwise your configured provider replies. Every tool run stays read-only and records an audit trail.`}
            </p>
          </div>
        </section>

        {/* context */}
        <aside className="hidden lg:flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-0 overflow-y-auto">
          <div className="p-3 space-y-3">
            {plan && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5"><GitMerge className="h-3 w-3" /> Run plan</p>
                <div className="flex flex-wrap gap-1.5">
                  {plan.tools.map((t) => (
                    <span key={`${plan.summary}-${t.tool}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${canRun(t.tool) ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' : 'bg-gray-100 dark:bg-gray-900 text-gray-400'}`}>
                      <Wrench className="h-3 w-3" /> {t.tool}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">{plan.summary}</p>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5"><ListChecks className="h-3 w-3" /> Agents</p>
              <div className="space-y-1">
                {AI_AGENTS.slice(0, 6).map((a) => (
                  <div key={a.id} className="rounded-lg border border-gray-100 dark:border-gray-800 px-2.5 py-2">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><Bot className="h-3 w-3 text-purple-400" /> {a.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{a.tools.map((t) => t.split('_').join(' ')).join(' · ')}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> Approved writes</p>
              <button onClick={() => void prepare()} className="w-full text-left rounded-xl border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950">
                <span className="font-medium">Phase 2 approvals — prepared, not executed.</span>
                <span className="block mt-0.5 opacity-80">Merge, approve a claim, edit a listing, send outreach, toggle features.</span>
              </button>
              {prepared.length > 0 && (
                <div className="mt-2 space-y-1">
                  {prepared.map((p) => (
                    <div key={p.name} className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-2.5 py-1.5">
                      <Clock className="h-3 w-3 text-amber-500" />
                      <span className="text-[11px] text-gray-700 dark:text-gray-300">{p.name}</span>
                      <span className="ml-auto text-[10px] text-gray-400">{p.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5"><RefreshCw className="h-3 w-3" /> Read tools ({READ_TOOLS.length})</p>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {READ_TOOLS.map((t) => (
                  <div key={t.name} className="flex items-center gap-2 px-1 py-1">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${t.risk === 'READ' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="text-[11px] text-gray-600 dark:text-gray-300 flex-1 truncate" title={t.description}>{t.label}</span>
                    <Lock className="h-3 w-3 text-emerald-500 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}