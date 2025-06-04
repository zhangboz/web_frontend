// src/components/ResultsPage.js
import React, { useState } from 'react';
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
        customStyle={{
          borderRadius: '8px',
          padding: '1em',
          margin: '1em 0',
          overflowX: 'auto',
          fontSize: '0.9em',
        }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  }

  return <code className={className}>{children}</code>;
};


// Accept backendUrl as a prop
function ResultsPage({ response, onReset, backendUrl }) {
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [exportFileName, setExportFileName] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const markdownToDisplay = typeof response === 'string' && response.trim() !== ''
    ? response
    : "未能获取到有效的 AI 结果。";

  const handleExportToWord = async () => {
    setIsExporting(true);
    setDownloadUrl(null);
    setExportError(null);

    try {
      // Use the dynamic backendUrl passed as a prop
      const backendExportUrl = `${backendUrl}/api/export/docx`;
      const requestBody = { markdownText: markdownToDisplay };

      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      };

      const res = await fetch(backendExportUrl, fetchOptions);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to export document. Server response not ok.');
      }

      const data = await res.json();
      if (data.success) {
        // downloadUrl from backend is already fully qualified, no change needed here
        setDownloadUrl(data.downloadUrl);
        setExportFileName(data.fileName || 'document.docx');
      } else {
        throw new Error(data.message || 'Export process failed on the server.');
      }
    } catch (error) {
      console.error('Export error:', error);
      setExportError(`导出失败: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container results-page">
      <h2>Results</h2>
      <div className="results-content markdown-body">
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            remarkMath
          ]}
          rehypePlugins={[
            rehypeKatex
          ]}
          components={{
            code: CodeBlock,
          }}
        >
          {markdownToDisplay}
        </ReactMarkdown>
      </div>

      <div className="export-section">
        {!downloadUrl && !exportError && (
          <button
            onClick={handleExportToWord}
            className="button secondary-button"
            disabled={isExporting}
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

        {exportError && (
          <p className="error-message export-error-message">{exportError}</p>
        )}
      </div>

      <button onClick={onReset} className="button primary-button">
        Start New Request
      </button>
    </div>
  );
}

export default ResultsPage;