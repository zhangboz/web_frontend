// src/components/ResultsPage.js
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

function ResultsPage({ response, onReset, backendUrl }) {
  // Existing state for document export
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [exportFileName, setExportFileName] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // New state for voice explanation
  const [isFetchingAudio, setIsFetchingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioError, setAudioError] = useState(null);

  const reply1Content = (response && response.reply1 && typeof response.reply1 === 'string')
    ? response.reply1
    : "";
  const reply2Content = (response && response.reply2 && typeof response.reply2 === 'string')
    ? response.reply2
    : null;

  const markdownToDisplay = reply1Content.trim() !== ''
    ? reply1Content
    : "未能获取到有效的 AI 结果 (reply1)。";
  const markdownToExport = reply1Content;

  useEffect(() => {
    let currentAudioUrl = audioUrl;
    return () => {
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }
    };
  }, [audioUrl]);

  const handleExportToWord = async () => {
    setIsExporting(true);
    setDownloadUrl(null);
    setExportError(null);
    try {
      const backendExportUrl = `${backendUrl}/api/export/docx`;
      const requestBody = { markdownText: markdownToExport };
      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      };
      const res = await fetch(backendExportUrl, fetchOptions);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to export document. Server response not ok.');
      }
      const data = await res.json();
      if (data.success) {
        setDownloadUrl(data.downloadUrl);
        setExportFileName(data.fileName || 'document.docx');
      } else {
        throw new Error(data.message || 'Export process failed on the server.');
      }
    } catch (error)
    {
      console.error('Export error:', error);
      setExportError(`导出失败: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExplainInVoice = async () => {
    if (!reply2Content) {
      setAudioError("No text available to synthesize for voice explanation.");
      return;
    }
    setIsFetchingAudio(true);
    setAudioUrl(null);
    setAudioError(null);
    try {
      const speechApiUrl = `${backendUrl}/api/speech`;
      const requestBody = {
        text: reply2Content,
        voice: "",
      };
      const response = await fetch(speechApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'audio/wav',
        },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        let errorMessage = `语音合成失败。状态码: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          try {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          } catch (e2) { /* ignore */ }
        }
        throw new Error(errorMessage);
      }
      const audioBlob = await response.blob();
      if (audioBlob.type && !audioBlob.type.startsWith('audio/')) {
         console.warn(`Unexpected audio blob type: ${audioBlob.type}. Expected 'audio/wav' or similar.`);
      }
      const newAudioUrl = URL.createObjectURL(audioBlob);
      setAudioUrl(newAudioUrl);
    } catch (error) {
      console.error('Error fetching speech:', error);
      setAudioError(`${error.message}`);
    } finally {
      setIsFetchingAudio(false);
    }
  };

  return (
    <div className="container results-page">
      <h2>Results</h2>
      <div className="results-content markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{ code: CodeBlock }}
        >
          {markdownToDisplay}
        </ReactMarkdown>
      </div>

      {reply2Content && (
        <div className="voice-explanation-section section-divider">
          <h4>Voice Explanation</h4>
          {audioError && <p className="error-message audio-error-message">{audioError}</p>}
          {!audioUrl && !isFetchingAudio && (
            <button
              onClick={handleExplainInVoice}
              className="button accent-button"
              disabled={!reply2Content}
            >
              🎤 Explain in Voice
            </button>
          )}
          {isFetchingAudio && (
            <div className="loading-audio">
              <div className="spinner small-spinner"></div>
              <span>Synthesizing audio...</span>
            </div>
          )}
          {audioUrl && (
            <div className="audio-player-container">
              <audio
                controls
                src={audioUrl}
                id="voice-explanation-player"
                controlsList="nodownload" // <<< THE CHANGE IS HERE
              >
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
        </div>
      )}

      <div className="export-section section-divider">
        <h4>Document Export</h4>
        {!downloadUrl && !exportError && (
          <button
            onClick={handleExportToWord}
            className="button secondary-button"
            disabled={isExporting || markdownToDisplay === "未能获取到有效的 AI 结果 (reply1)。"}
          >
            {isExporting ? 'Exporting to Word...' : '📄 Export to Word'}
          </button>
        )}
        {isExporting && <div className="spinner small-spinner"></div>}
        {downloadUrl && (
          <div className="download-area">
            <p>Your document is ready:</p>
            <a
              href={downloadUrl}
              download={exportFileName}
              className="button download-button"
              target="_blank"
              rel="noopener noreferrer"
            >
              ⬇️ Download {exportFileName}
            </a>
            <p className="download-note">This file will be available for ~5 minutes.</p>
          </div>
        )}
        {exportError && <p className="error-message export-error-message">{exportError}</p>}
      </div>

      <button onClick={onReset} className="button primary-button button-full-width">
        Start New Request
      </button>
    </div>
  );
}

export default ResultsPage;