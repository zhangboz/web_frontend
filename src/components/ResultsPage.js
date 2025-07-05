import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { okaidia } from 'react-syntax-highlighter/dist/esm/styles/prism';

import './ResultsPage.css';

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

function ResultsPage({ response, backendUrl, user, token, onRequestLogin, onSubscribe, audioCache, setAudioCache, isBottomNavVisible }) {
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [exportFileName, setExportFileName] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  const hasActiveSubscription = user && user.subscriptionStatus === 'active';
  
  const reply1Content = (response?.reply1 && typeof response.reply1 === 'string') ? response.reply1 : "";
  // This will correctly be null if the response from the new endpoint doesn't include reply2
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
      console.log("Audio URL created:", objectUrl);
    } else {
      setAudioUrl(null);
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        console.log("Audio URL revoked:", objectUrl);
      }
    };
  }, [audioBlob]);

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

  const doExport = async () => {
    setIsExporting(true);
    setDownloadUrl(null);
    setExportError(null);
    try {
      const res = await fetch(`${backendUrl}/api/export/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ markdownText: markdownToExport }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to export document.');
      }
      const data = await res.json();
      if (data.success) {
        setDownloadUrl(data.downloadUrl);
        setExportFileName(data.fileName || 'document.docx');
      } else {
        throw new Error(data.message || 'Export process failed.');
      }
    } catch (error) {
      console.error('Export error:', error);
      setExportError(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const doVoiceExplain = async () => {
    if (!reply2Content || isFetchingAudio) {
      return;
    }
    
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

  return (
    <div className="results-page-layout">
      <div className="results-scroll-container">
        {/* --- FIX: Removed the h2 title for better desktop alignment --- */}
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
        {/* This block will not render if reply2Content is null, which is the desired behavior */}
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

        <div className="action-item-vertical">
          {downloadUrl ? (
             <a href={downloadUrl} download={exportFileName} className="button primary-button" target="_blank" rel="noopener noreferrer">
              ⬇️ Download Document
            </a>
          ) : (
            <button onClick={() => handlePremiumFeature(doExport, 'Export to Word')} className="button secondary-button" disabled={isExporting}>
              {isExporting ? <div className="spinner-small-dark"></div> : '📄 Export to Word'}
            </button>
          )}
          {exportError && <p className="error-message small-error">{exportError}</p>}
        </div>
      </div>
    </div>
  );
}

export default ResultsPage;