import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import './ConceptExplanation.css';

export const CONCEPT_LIMIT_MESSAGE = '此功能并非通用chat bot，关键词解释只支持2轮对话，是否需要我帮你把刚才的上下文导出以便于你在其他chat bot中继续？';
const MAX_TEXT_LENGTH = 2000;
// Keep only channel identifiers and counters across Results-page remounts and
// refreshes. No question, selection, message, citation or model context is saved.
const CHANNEL_STORAGE_KEY = 'conceptChannelMetadata';
const channels = new Map();
let channelsRestored = false;

const copy = {
  en: {
    hint: 'Select a concept in your answer to explore its meaning.', action: 'ChatGPT explain',
    unavailable: 'Concept explanations are available for newly generated homework answers.',
    title: 'Concept explanation', close: 'Close explanation', selected: 'Selected text',
    thinking: 'Reading the question and explaining this concept…', you: 'You', assistant: 'ChatGPT',
    followup: 'Ask one follow-up about this concept', send: 'Send', exporting: 'Preparing export…',
    export: 'Export context', sources: 'Sources', refused: 'This explanation has ended. Select a different passage to start again.',
    privacy: 'Starting another explanation removes this conversation.',
    failed: 'The explanation could not be completed. Please try again.',
    expired: 'This question context has expired. Generate the homework answer again to explain a concept.',
    tooLong: 'Select up to 2,000 characters.', rounds: 'rounds',
    limitHint: 'Both rounds are used. You can export the context to continue elsewhere.',
  },
  zh: {
    hint: '选中答案中的概念或术语，让 ChatGPT 结合原题解释。', action: 'ChatGPT 解释',
    unavailable: '重新生成作业答案后，即可使用选中文本解释。',
    title: '关键词解释', close: '关闭解释', selected: '选中文本',
    thinking: '正在结合完整题目解释这个概念…', you: '你', assistant: 'ChatGPT',
    followup: '围绕这个概念追问一次', send: '发送', exporting: '正在准备导出…',
    export: '导出上下文', sources: '参考来源', refused: '本次解释已结束。可以选择其他文本开始新的解释。',
    privacy: '开始新的解释后，本次对话将被删除。',
    failed: '暂时无法完成解释，请重试。',
    expired: '题目上下文已过期，请重新生成作业答案后再解释。',
    tooLong: '请选择不超过 2,000 个字符的文本。', rounds: '轮',
    limitHint: '已使用两轮对话，可以导出上下文到其他聊天工具继续。',
  },
};

function clientId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function channelFor(contextId) {
  if (!channelsRestored) {
    channelsRestored = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(CHANNEL_STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) {
        for (const item of saved.slice(-64)) {
          if (item && typeof item.contextId === 'string' && typeof item.clientId === 'string' &&
              /^[a-zA-Z0-9-]{1,128}$/.test(item.contextId) && /^[a-zA-Z0-9-]{1,128}$/.test(item.clientId) &&
              Number.isSafeInteger(item.revision) && item.revision >= 0 && item.revision < Number.MAX_SAFE_INTEGER - 1000) {
            channels.set(item.contextId, { clientId: item.clientId, revision: { current: item.revision } });
          }
        }
      }
    } catch { /* Corrupt or unavailable storage starts a fresh channel. */ }
  }
  if (contextId && channels.has(contextId)) return channels.get(contextId);
  const channel = { clientId: clientId(), revision: { current: 0 } };
  if (contextId) {
    if (channels.size >= 64) channels.delete(channels.keys().next().value);
    channels.set(contextId, channel);
  }
  return channel;
}

function saveChannelMetadata() {
  try {
    sessionStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(Array.from(channels, ([contextId, channel]) => ({
      contextId, clientId: channel.clientId, revision: channel.revision.current,
    }))));
  } catch { /* Private mode/storage quotas must not block an explanation. */ }
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export default function ConceptExplanation({ contextId, backendUrl, token, anonymousId, language = 'en', children }) {
  const labels = copy[language] || copy.en;
  const contentRef = useRef(null);
  const panelRef = useRef(null);
  const channelRef = useRef(null);
  if (!channelRef.current) channelRef.current = channelFor(contextId);
  const clientRef = useRef(channelRef.current.clientId);
  const revisionRef = channelRef.current.revision;
  const activeRequestRef = useRef(null);
  const exportRequestRef = useRef(null);
  const mountedRef = useRef(true);
  const channelUsedRef = useRef(false);
  const [selection, setSelection] = useState(null);
  const [session, setSession] = useState(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');

  const headers = useCallback(() => ({
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  const deleteChannel = useCallback(() => {
    activeRequestRef.current?.abort();
    exportRequestRef.current?.abort();
    const revision = ++revisionRef.current;
    if (!contextId || !channelUsedRef.current) return;
    saveChannelMetadata();
    // The revision tombstone also cancels a start that has not reached the server yet.
    const request = fetch(`${backendUrl}/api/concept-explanations/channel`, {
      method: 'DELETE', headers: headers(), keepalive: true,
      body: JSON.stringify({ contextId, clientId: clientRef.current, revision, anonymousId }),
    });
    request?.catch(() => {}); // The server also expires abandoned sessions.
  }, [anonymousId, backendUrl, contextId, headers, revisionRef]);
  const deleteChannelRef = useRef(deleteChannel);
  deleteChannelRef.current = deleteChannel;

  useEffect(() => {
    mountedRef.current = true;
    const leave = () => {
      deleteChannelRef.current();
      setSession(null);
      setSelectedText('');
      setQuestion('');
      setError('');
      setPending(false);
      setExporting(false);
      setOpen(false);
    };
    window.addEventListener('pagehide', leave);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', leave);
      deleteChannelRef.current();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    const escape = event => { if (event.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);

  useEffect(() => {
    if (!contextId) return undefined;
    const capture = () => {
      const rangeSelection = window.getSelection();
      const root = contentRef.current;
      if (!rangeSelection || rangeSelection.isCollapsed || !rangeSelection.rangeCount ||
          !root?.contains(rangeSelection.anchorNode) || !root.contains(rangeSelection.focusNode)) {
        setSelection(null);
        return;
      }
      const text = rangeSelection.toString().trim();
      if (!text) { setSelection(null); return; }
      const range = rangeSelection.getRangeAt(0);
      const rectangle = range.getBoundingClientRect?.() || { left: 24, bottom: 100 };
      setSelection({ text, left: Math.max(12, Math.min(rectangle.left, window.innerWidth - 190)),
        top: Math.max(12, Math.min(rectangle.bottom + 10, window.innerHeight - 72)) });
    };
    document.addEventListener('selectionchange', capture);
    document.addEventListener('pointerup', capture);
    document.addEventListener('keyup', capture);
    window.addEventListener('resize', capture);
    document.addEventListener('scroll', capture, true);
    return () => {
      document.removeEventListener('selectionchange', capture);
      document.removeEventListener('pointerup', capture);
      document.removeEventListener('keyup', capture);
      window.removeEventListener('resize', capture);
      document.removeEventListener('scroll', capture, true);
    };
  }, [contextId]);

  const readResponse = async response => {
    const data = await response.json();
    if (!response.ok) {
      const expired = response.status === 410 || ['CONCEPT_CONTEXT_EXPIRED', 'CONTEXT_EXPIRED', 'CONTEXT_NOT_FOUND', 'EXPLANATION_EXPIRED'].includes(data.code);
      throw new Error(expired ? labels.expired : (data.message || labels.failed));
    }
    return data;
  };

  const start = async () => {
    if (!selection?.text || !contextId) return;
    if (selection.text.length > MAX_TEXT_LENGTH) { setError(labels.tooLong); return; }
    const text = selection.text;
    activeRequestRef.current?.abort();
    exportRequestRef.current?.abort();
    const revision = ++revisionRef.current;
    saveChannelMetadata();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    channelUsedRef.current = true;
    setSession(null);
    setSelectedText(text);
    setQuestion('');
    setError('');
    setPending(true);
    setExporting(false);
    setOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    try {
      const response = await fetch(`${backendUrl}/api/concept-explanations/start`, {
        method: 'POST', headers: headers(), signal: controller.signal,
        body: JSON.stringify({ contextId, clientId: clientRef.current, revision, selectedText: text, anonymousId }),
      });
      const data = await readResponse(response);
      if (mountedRef.current && revision === revisionRef.current) setSession(data);
    } catch (failure) {
      if (!controller.signal.aborted && mountedRef.current && revision === revisionRef.current) setError(failure.message || labels.failed);
    } finally {
      if (mountedRef.current && revision === revisionRef.current) setPending(false);
    }
  };

  const followUp = async event => {
    event.preventDefault();
    if (!session || pending || !question.trim() || ['refused', 'limited'].includes(session.status)) return;
    const revision = revisionRef.current;
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setError('');
    setPending(true);
    try {
      const response = await fetch(`${backendUrl}/api/concept-explanations/${encodeURIComponent(session.sessionId)}/messages`, {
        method: 'POST', headers: headers(), signal: controller.signal,
        body: JSON.stringify({ message: question.trim(), anonymousId }),
      });
      const data = await readResponse(response);
      if (mountedRef.current && revision === revisionRef.current) {
        setSession(data);
        setQuestion('');
      }
    } catch (failure) {
      if (!controller.signal.aborted && mountedRef.current && revision === revisionRef.current) setError(failure.message || labels.failed);
    } finally {
      if (mountedRef.current && revision === revisionRef.current) setPending(false);
    }
  };

  const exportContext = async () => {
    if (!session || exporting) return;
    const revision = revisionRef.current;
    const controller = new AbortController();
    exportRequestRef.current = controller;
    setExporting(true);
    setError('');
    try {
      const query = new URLSearchParams(anonymousId ? { anonymousId } : {});
      const response = await fetch(`${backendUrl}/api/concept-explanations/${encodeURIComponent(session.sessionId)}/export?${query}`, {
        headers: headers(), signal: controller.signal,
      });
      const data = await readResponse(response);
      if (!mountedRef.current || revision !== revisionRef.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename || 'concept-context.md';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (!controller.signal.aborted && mountedRef.current && revision === revisionRef.current) setError(failure.message || labels.failed);
    } finally {
      if (mountedRef.current && revision === revisionRef.current) setExporting(false);
    }
  };

  const close = () => {
    deleteChannel();
    setOpen(false);
    setSession(null);
    setQuestion('');
    setSelectedText('');
    setError('');
    setPending(false);
    setExporting(false);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  return <>
    <p className="concept-selection-hint">{contextId ? labels.hint : labels.unavailable}</p>
    <div ref={contentRef} className="concept-selectable-answer">{children}</div>
    {selection && <button type="button" className="concept-selection-button"
      style={{ left: selection.left, top: selection.top }}
      onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={start}>
      <span aria-hidden="true">✦</span> {labels.action}
    </button>}
    {!open && error && <p role="alert" className="concept-error">{error}</p>}
    {open && <section ref={panelRef} tabIndex={-1} className="concept-panel" aria-label={labels.title}>
      <header className="concept-panel-header">
        <div><span className="concept-eyebrow">CHATGPT</span><h2>{labels.title}</h2></div>
        <div className="concept-header-actions"><span className="concept-rounds">{session?.turnCount || 0}/2 {labels.rounds}</span>
          <button type="button" className="concept-close" aria-label={labels.close} onClick={close}>×</button></div>
      </header>
      <div className="concept-panel-content">
        <div className="concept-selected"><span>{labels.selected}</span><blockquote>{selectedText}</blockquote></div>
        <div className="concept-messages" aria-live="polite" aria-relevant="additions text">
          {(session?.messages || []).map((item, index) => <article className={`concept-message concept-message-${item.role}`} key={index}>
            <h3>{item.role === 'assistant' ? labels.assistant : labels.you}</h3>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}
              components={{ a: ({ href, children: linkText }) => safeUrl(href)
                ? <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer">{linkText}</a> : <span>{linkText}</span>,
                img: ({ alt }) => <span>{alt}</span> }}>
              {item.content}
            </ReactMarkdown>
            {!!item.citations?.length && <div className="concept-sources"><h4>{labels.sources}</h4><ol>
              {item.citations.filter(citation => safeUrl(citation.url)).map((citation, citationIndex) => <li key={citationIndex}>
                <a href={safeUrl(citation.url)} target="_blank" rel="noopener noreferrer">{citation.title || citation.url}</a>
              </li>)}
            </ol></div>}
          </article>)}
          {pending && <p className="concept-pending" role="status"><span className="concept-pending-dot" />{labels.thinking}</p>}
          {session?.status === 'limited' && <p className="concept-limit" role="status">{CONCEPT_LIMIT_MESSAGE}</p>}
          {session?.status === 'refused' && <p className="concept-limit" role="status">{labels.refused}</p>}
        </div>
        {error && <p role="alert" className="concept-error">{error}</p>}
      </div>
      <footer className="concept-panel-footer">
        {session && !['refused', 'limited'].includes(session.status) && <form onSubmit={followUp} className="concept-followup">
          <label htmlFor={`concept-question-${clientRef.current}`}>{labels.followup}</label>
          <div><textarea id={`concept-question-${clientRef.current}`} value={question} maxLength={MAX_TEXT_LENGTH}
            onChange={event => setQuestion(event.target.value)} disabled={pending} rows={2} />
            <button type="submit" disabled={pending || !question.trim()}>{labels.send}</button></div>
          {session.turnCount >= 2 && <p className="concept-budget-note">{labels.limitHint}</p>}
        </form>}
        {session && <button type="button" className="concept-export" disabled={pending || exporting} onClick={exportContext}>
          {exporting ? labels.exporting : labels.export}
        </button>}
        <p className="concept-privacy">{labels.privacy}</p>
      </footer>
    </section>}
  </>;
}
