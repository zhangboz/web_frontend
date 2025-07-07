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
        case 'queuing': return 'Queuing...';
        case 'polling': return 'Processing...';
        default: return 'Export'; // For 'idle' or 'failed'
    }
}

// --- NEW HELPER: Logic to load and validate state from sessionStorage ---
const getInitialExportState = () => {
    const defaultState = {
        docx: { status: 'idle', jobId: null, downloadUrl: null, error: null },
        pdf: { status: 'idle', jobId: null, downloadUrl: null, error: null },
    };

    try {
        const storedState = sessionStorage.getItem('exportState');
        if (!storedState) return defaultState;
        
        const parsedState = JSON.parse(storedState);
        
        // Validate the loaded state to remove expired URLs
        Object.keys(parsedState).forEach(format => {
            const job = parsedState[format];
            if (job.status === 'completed' && (!job.expiresAt || Date.now() > job.expiresAt)) {
                // This URL has expired, reset it to the default idle state.
                parsedState[format] = { status: 'idle', jobId: null, downloadUrl: null, error: null };
            }
        });
        return parsedState;

    } catch (e) {
        // If parsing fails for any reason, return a clean state.
        return defaultState;
    }
};

function ResultsPage({ response, backendUrl, user, token, onRequestLogin, onSubscribe, audioCache, setAudioCache, isBottomNavVisible }) {
  // --- MODIFIED: useState now uses our helper to load from sessionStorage on initial render ---
  const [exportState, setExportState] = useState(getInitialExportState);

  // --- NEW: This effect saves the state to sessionStorage whenever it changes ---
  useEffect(() => {
    const stateToStore = {};
    Object.keys(exportState).forEach(format => {
        const job = exportState[format];
        // We only store states that are worth remembering across a refresh.
        if (job.status === 'completed' || job.status === 'failed') {
            stateToStore[format] = job;
        } else {
            // Don't save 'queuing' or 'polling' states, they should reset to idle on a refresh.
            stateToStore[format] = { status: 'idle', jobId: null, downloadUrl: null, error: null };
        }
    });
    sessionStorage.setItem('exportState', JSON.stringify(stateToStore));
  }, [exportState]);

  // State for audio logic
  const [audioUrl, setAudioUrl] = React.useState(null);
  const pollingRefs = useRef({});

  const hasActiveSubscription = user && user.subscriptionStatus === 'active';
  
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

  // --- MODIFIED: pollJobStatus now adds an expiration timestamp on completion ---
  const pollJobStatus = useCallback((jobId, format) => {
    if (pollingRefs.current[format]) {
        clearInterval(pollingRefs.current[format]);
    }

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/export/status/${jobId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Status check failed.');
        
        const data = await res.json();

        if (data.state === 'completed') {
          clearInterval(intervalId);
          // GCS signed URLs from the worker last 15 minutes. We set our local timer to 14 mins to be safe.
          const expiresAt = Date.now() + 14 * 60 * 1000; 
          setExportState(prev => ({
            ...prev,
            [format]: { status: 'completed', downloadUrl: data.result.downloadUrl, error: null, expiresAt }
          }));
        } else if (data.state === 'failed') {
          clearInterval(intervalId);
          setExportState(prev => ({ ...prev, [format]: { ...prev[format], status: 'failed', error: 'Conversion failed on the server.' } }));
        }
      } catch (error) {
        clearInterval(intervalId);
        setExportState(prev => ({ ...prev, [format]: { ...prev[format], status: 'failed', error: error.message } }));
      }
    }, 3000);

    pollingRefs.current[format] = intervalId;

    setTimeout(() => {
        const poller = pollingRefs.current[format];
        if (poller === intervalId) {
            clearInterval(poller);
            setExportState(prev => {
                if (prev[format].status === 'polling' || prev[format].status === 'queuing') {
                    return { ...prev, [format]: { ...prev[format], status: 'failed', error: 'Export timed out.' } };
                }
                return prev;
            });
        }
    }, 120000);

  }, [backendUrl, token]);

  // Export handling function
  const handleExport = async (format) => {
    setExportState(prev => ({ ...prev, [format]: { status: 'queuing', jobId: null, downloadUrl: null, error: null } }));
    
    try {
      const res = await fetch(`${backendUrl}/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ markdownText: markdownToExport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to queue export job.');
      
      if (data.success && data.jobId) {
        setExportState(prev => ({ ...prev, [format]: { ...prev[format], status: 'polling', jobId: data.jobId } }));
        pollJobStatus(data.jobId, format);
      } else {
        throw new Error(data.message || 'Server did not return a job ID.');
      }
    } catch (error) {
      console.error(`Export queueing error for ${format}:`, error);
      setExportState(prev => ({ ...prev, [format]: { status: 'failed', error: error.message } }));
    }
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
    setAudioCache(prevCache => new Map(prevCache).set(reply2Content, { status: 'pending' }));
    try {
      const response = await fetch(`${backendUrl}/api/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'audio/wav', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ text: reply2Content, voice: "" }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Synthesis failed.' }));
        throw new Error(errorData.message);
      }
      const newAudioBlob = await response.blob();
      setAudioCache(prevCache => new Map(prevCache).set(reply2Content, { status: 'success', data: newAudioBlob }));
    } catch (error) {
      console.error('Error fetching speech:', error);
      setAudioCache(prevCache => new Map(prevCache).set(reply2Content, { status: 'error', error: error.message }));
    }
  };
  
  // Cleanup effect for polling intervals
  useEffect(() => {
    const currentPollers = pollingRefs.current;
    return () => {
      Object.values(currentPollers).forEach(clearInterval);
    };
  }, []);

  // --- RENDER LOGIC (UNCHANGED) ---
  return (
    <div className="results-page-layout">
      <div className="results-scroll-container">
        <div className="results-content markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{ code: CodeBlock }}
          >
            {markdownToDisplay}
          </ReactMarkdown>
        </div>
      </div>
      
      <div className={`results-action-bar-vertical ${isBottomNavVisible ? 'with-nav' : ''}`}>
        
        {/* Voice Explanation Button & Player */}
        {reply2Content && (
          <div className="action-item-vertical">
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
                ? <div className="spinner-small-dark"></div> 
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
                ? <div className="spinner-small-dark"></div>
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