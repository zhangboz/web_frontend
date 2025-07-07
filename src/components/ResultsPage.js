// ResultsPage.js (REPLACE THE ENTIRE FUNCTION)

import React, { useState, useEffect, useCallback, useRef } from 'react'; // <-- Add useRef
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { okaidia } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';

import './ResultsPage.css';

// This component remains unchanged
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

// --- NEW HELPER FOR BUTTON TEXT ---
const getExportButtonText = (status) => {
    switch (status) {
        case 'queuing':
            return 'Queuing...';
        case 'polling':
            return 'Processing...';
        default:
            return 'Export'; // For 'idle' or 'failed'
    }
}

function ResultsPage({ response, backendUrl, user, token, onRequestLogin, onSubscribe, audioCache, setAudioCache, isBottomNavVisible }) {
  // --- MODIFIED: State now includes job status and ID ---
  const [exportState, setExportState] = useState({
    docx: { status: 'idle', jobId: null, downloadUrl: null, fileName: null, error: null },
    pdf: { status: 'idle', jobId: null, downloadUrl: null, fileName: null, error: null },
  });

  const [audioUrl, setAudioUrl] = React.useState(null);
  const pollingRefs = useRef({}); // Use a ref to store interval IDs

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

  // --- NEW: Polling logic is now in a reusable function ---
  const pollJobStatus = useCallback((jobId, format) => {
    // Clear any existing poller for this format
    if (pollingRefs.current[format]) {
        clearInterval(pollingRefs.current[format]);
    }

    // Set a new interval
    pollingRefs.current[format] = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/export/status/${jobId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Status check failed.');
        
        const data = await res.json();

        if (data.state === 'completed') {
          clearInterval(pollingRefs.current[format]);
          setExportState(prev => ({
            ...prev,
            [format]: { ...prev[format], status: 'completed', downloadUrl: data.result.downloadUrl, fileName: data.result.fileName, error: null }
          }));
        } else if (data.state === 'failed') {
          clearInterval(pollingRefs.current[format]);
          setExportState(prev => ({
            ...prev,
            [format]: { ...prev[format], status: 'failed', error: 'Conversion process failed on the server.' }
          }));
        }
        // If state is 'active' or 'waiting', do nothing and let it poll again.

      } catch (error) {
        clearInterval(pollingRefs.current[format]);
        setExportState(prev => ({
          ...prev,
          [format]: { ...prev[format], status: 'failed', error: error.message }
        }));
      }
    }, 3000); // Poll every 3 seconds

    // Safety timeout: stop polling after 2 minutes
    setTimeout(() => {
        if (pollingRefs.current[format]) {
            clearInterval(pollingRefs.current[format]);
            const currentState = exportState[format].status;
            if (currentState === 'polling' || currentState === 'queuing') {
                 setExportState(prev => ({ ...prev, [format]: { ...prev[format], status: 'failed', error: 'Export timed out.' } }));
            }
        }
    }, 120000); // 2 minutes

  }, [backendUrl, token, exportState]);


  // --- MODIFIED: doExport is now handleExport, it queues a job ---
  const handleExport = async (format) => {
    setExportState(prev => ({ ...prev, [format]: { status: 'queuing', jobId: null, downloadUrl: null, fileName: null, error: null } }));
    
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
        pollJobStatus(data.jobId, format); // Start polling
      } else {
        throw new Error(data.message || 'Server did not return a job ID.');
      }
    } catch (error) {
      console.error(`Export queueing error for ${format}:`, error);
      setExportState(prev => ({ ...prev, [format]: { status: 'failed', error: error.message } }));
    }
  };

  const handlePremiumFeature = (featureAction, featureName) => {
    if (!user) {
      return onRequestLogin();
    }
    if (!hasActiveSubscription) {
      if(window.confirm(`'${featureName}' is a premium feature. Would you like to subscribe now?`)) {
        onSubscribe();
      }
      return;
    }
    featureAction();
  };

  const doVoiceExplain = async () => {
    // This function remains unchanged
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
  
  // --- NEW: Cleanup effect to stop polling when component unmounts ---
  useEffect(() => {
    // This is the cleanup function that runs when the component is unmounted
    return () => {
      Object.values(pollingRefs.current).forEach(clearInterval);
    };
  }, []);

  // --- RENDER LOGIC UPDATED FOR NEW STATES ---
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

        {/* --- DOCX Button Logic --- */}
        <div className="action-item-vertical">
          {exportState.docx.status === 'completed' ? (
             <a href={exportState.docx.downloadUrl} download={exportState.docx.fileName} className="button primary-button" target="_blank" rel="noopener noreferrer">
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
        
        {/* --- PDF Button Logic --- */}
        <div className="action-item-vertical">
          {exportState.pdf.status === 'completed' ? (
             <a href={exportState.pdf.downloadUrl} download={exportState.pdf.fileName} className="button primary-button" target="_blank" rel="noopener noreferrer">
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