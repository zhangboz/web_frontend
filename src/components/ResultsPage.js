// ResultsPage.js (REPLACE THE ENTIRE FILE)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { okaidia } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import './ResultsPage.css';
import { hasSubscriptionAccess } from '../utils/subscription';
import { emptyExportJob, restoreExportState, persistExportState, isPendingExport, createExportRunner } from '../utils/exportState';
import ConceptExplanation from './ConceptExplanation';

// This component remains unchanged and is perfectly fine.
const CodeBlock = ({ inline, className, children }) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!inline && match) {
    return (
      <SyntaxHighlighter
        style={okaidia}
        language={match[1]}
        PreTag="div"
        customStyle={{ borderRadius: '8px', padding: '1em', margin: '1em 0', overflowX: 'auto', fontSize: '0.9em' }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  }
  return <code className={className}>{children}</code>;
};

// This helper is good. Keep it.
const getExportButtonText = (status) => {
    switch (status) {
        case 'queuing': return 'Starting export...';
        case 'polling': return 'Generating document...';
        default: return 'Export'; // For 'idle' or 'failed'
    }
}

// --- NEW HELPER: Logic to load and validate state from sessionStorage ---
function ResultsPage({ response, backendUrl, user, token, anonymousId, language = 'en', onRequestLogin, onSubscribe, audioCache, setAudioCache, isBottomNavVisible }) {
  // --- MODIFIED: useState now uses our helper to load from sessionStorage on initial render ---
  const [exportState, setExportState] = useState(() => restoreExportState(
    sessionStorage.getItem('exportState'), response?.reply1 || '', user?.id || null));

  const exportStateRef = useRef(exportState);
  const pollingRefs = useRef({});
  const saveExportState = useCallback(next => {
    exportStateRef.current = next;
    persistExportState(sessionStorage, next, response?.reply1 || '', user?.id || null);
    setExportState(next);
  }, [response?.reply1, user?.id]);

  useEffect(() => {
    const deadlines = Object.values(exportState).filter(job => job.status === 'completed').map(job => job.expiresAt);
    if (!deadlines.length) return undefined;
    const timeout = setTimeout(() => {
      const next = { ...exportStateRef.current };
      for (const format of ['docx', 'pdf']) {
        if (next[format].status === 'completed' && next[format].expiresAt <= Date.now()) next[format] = emptyExportJob();
      }
      saveExportState(next);
    }, Math.max(0, Math.min(...deadlines) - Date.now()));
    return () => clearTimeout(timeout);
  }, [exportState, saveExportState]);

  // State for audio logic
  const [audioUrl, setAudioUrl] = React.useState(null);
  const audioRequestRef = useRef(null);

  const hasActiveSubscription = user && hasSubscriptionAccess(user.subscriptionStatus);

  const reply1Content = (response?.reply1 && typeof response.reply1 === 'string') ? response.reply1 : "";
  const reply2Content = (response?.reply2 && typeof response.reply2 === 'string') ? response.reply2 : null;
  const markdownToDisplay = reply1Content.trim() !== '' ? reply1Content : "Failed to get a valid AI result.";
  const markdownToExport = reply1Content;

  const cacheEntry = reply2Content ? audioCache.get(reply2Content) : null;
  const isFetchingAudio = cacheEntry?.status === 'pending';
  const audioBlob = cacheEntry?.status === 'success' ? cacheEntry.data : null;
  const audioError = cacheEntry?.status === 'error' ? cacheEntry.error : null;

  useEffect(() => {
    let objectUrl = null;
    if (audioBlob) {
      objectUrl = URL.createObjectURL(audioBlob);
      setAudioUrl(objectUrl);
    } else {
      setAudioUrl(null);
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioBlob]);

  const runExport = useCallback((format, job) => {
    pollingRefs.current[format]?.stop();
    const runner = createExportRunner({ backendUrl, token, format, markdownText: markdownToExport, job,
      onUpdate: nextJob => saveExportState({ ...exportStateRef.current, [format]: nextJob }),
    });
    pollingRefs.current[format] = runner;
    runner.start();
  }, [backendUrl, token, markdownToExport, saveExportState]);

  // Refresh resumes each pending job once, using its original creation key or known job ID.
  useEffect(() => {
    const runners = pollingRefs.current;
    if (token) {
      for (const format of ['docx', 'pdf']) {
        const job = exportStateRef.current[format];
        if (isPendingExport(job)) runExport(format, job);
      }
    }
    return () => { Object.values(runners).forEach(runner => runner.stop()); };
  }, [runExport, token]);

  const handleExport = format => {
    if (pollingRefs.current[format]?.running) return;
    const previous = exportStateRef.current[format];
    const job = previous.retryable && previous.requestKey
      ? { ...previous, startedAt: Date.now(), error: null }
      : { ...emptyExportJob(), requestKey: crypto.randomUUID(), startedAt: Date.now() };
    runExport(format, job);
  };

  // Premium feature gate
  const handlePremiumFeature = (featureAction, featureName) => {
    if (!user) return onRequestLogin();
    if (!hasActiveSubscription) {
      if(window.confirm(`'${featureName}' is a premium feature. Would you like to subscribe now?`)) {
        onSubscribe();
      }
      return;
    }
    featureAction();
  };

  // Voice explanation function
  const doVoiceExplain = async () => {
    if (!reply2Content || isFetchingAudio) return;
    const controller = new AbortController();
    audioRequestRef.current = controller;
    setAudioCache(prevCache => new Map(prevCache).set(reply2Content, { status: 'pending' }));
    try {
      const response = await fetch(`${backendUrl}/api/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'audio/wav', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text: reply2Content, voice: "" }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Synthesis failed.' }));
        throw new Error(errorData.message);
      }
      const newAudioBlob = await response.blob();
      setAudioCache(prevCache => new Map(prevCache).set(reply2Content, { status: 'success', data: newAudioBlob }));
    } catch (error) {
      if (error.name === 'AbortError') {
        setAudioCache(previous => { const next = new Map(previous); next.delete(reply2Content); return next; });
        return;
      }
      console.error('Error fetching speech:', error);
      setAudioCache(prevCache => new Map(prevCache).set(reply2Content, { status: 'error', error: error.message }));
    } finally {
      if (audioRequestRef.current === controller) audioRequestRef.current = null;
    }
  };

  useEffect(() => () => audioRequestRef.current?.abort(), []);

  // --- RENDER LOGIC (UNCHANGED) ---
  return (
    <div className="results-page-layout">
      <div className="results-scroll-container">
        {response?.warning && <p role="status" className="error-message">{response.warning}</p>}
        <ConceptExplanation key={response?.explanationContextId || 'unavailable'}
          contextId={response?.explanationContextId} backendUrl={backendUrl} token={token}
          anonymousId={anonymousId} language={response?.language || language}>
        <div className="results-content markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{ code: CodeBlock }}
          >
            {markdownToDisplay}
          </ReactMarkdown>
        </div>
        </ConceptExplanation>
      </div>

      <div className={`results-action-bar-vertical ${isBottomNavVisible ? 'with-nav' : ''}`}>

        {/* Voice Explanation Button & Player */}
        {reply2Content && (
          <div className="action-item-vertical">
            <small>AI-generated voice / AI 生成语音</small>
            {audioUrl && !isFetchingAudio ? (
              <audio controls src={audioUrl} className="full-width-audio-player"></audio>
            ) : (
              <button onClick={() => handlePremiumFeature(doVoiceExplain, 'Voice Explanation')} className="button" disabled={isFetchingAudio}>
                {isFetchingAudio ? <div className="spinner-small-light"></div> : '🎤 Explain in Voice'}
              </button>
            )}
            {audioError && <p className="error-message small-error">{audioError}</p>}
          </div>
        )}

        {/* DOCX Button Logic */}
        <div className="action-item-vertical">
          {exportState.docx.status === 'completed' ? (
             <a href={exportState.docx.downloadUrl} className="button primary-button">
              ⬇️ Download Word
            </a>
          ) : (
            <button
              onClick={() => handlePremiumFeature(() => handleExport('docx'), 'Export to Word')}
              className="button secondary-button"
              disabled={exportState.docx.status === 'queuing' || exportState.docx.status === 'polling'}
            >
              {(exportState.docx.status === 'queuing' || exportState.docx.status === 'polling')
                ? <><div className="spinner-small-dark"></div> Generating document…</>
                : `📄 ${getExportButtonText(exportState.docx.status)} to Word`
              }
            </button>
          )}
          {exportState.docx.error && <p className="error-message small-error">{exportState.docx.error}</p>}
        </div>

        {/* PDF Button Logic */}
        <div className="action-item-vertical">
          {exportState.pdf.status === 'completed' ? (
             <a href={exportState.pdf.downloadUrl} className="button primary-button">
              ⬇️ Download PDF
            </a>
          ) : (
            <button
              onClick={() => handlePremiumFeature(() => handleExport('pdf'), 'Export to PDF')}
              className="button secondary-button"
              disabled={exportState.pdf.status === 'queuing' || exportState.pdf.status === 'polling'}
            >
              {(exportState.pdf.status === 'queuing' || exportState.pdf.status === 'polling')
                ? <><div className="spinner-small-dark"></div> Generating document…</>
                : `📄 ${getExportButtonText(exportState.pdf.status)} to PDF`
              }
            </button>
          )}
          {exportState.pdf.error && <p className="error-message small-error">{exportState.pdf.error}</p>}
        </div>
      </div>
    </div>
  );
}

export default ResultsPage;
