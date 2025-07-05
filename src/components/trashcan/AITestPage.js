import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { okaidia } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css'; // Make sure to import KaTeX CSS
import './ResultsPage.css'; // Reuse the same CSS for consistency
import './AITestPage.css'; // Add a new CSS file for specific styles

// Reusing the CodeBlock component from ResultsPage
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

// A sample initial string to demonstrate usage
const initialMarkdown = `## Paste AI Output Here to Test Rendering

This page is for testing how raw Markdown from the AI will look.

**Features:**
- Real-time preview as you type.
- Uses the same rendering components as the real Results Page.
- Supports GitHub Flavored Markdown, LaTeX math, and code blocks.

### Example Math:
$E(x) = \\sum_{i=1}^{n} x_i P(x_i)$

### Example Table:
| Feature      | Supported |
|--------------|-----------|
| Markdown     | ✅        |
| KaTeX (Math) | ✅        |
| Code Blocks  | ✅        |

### Example Code Block:
\`\`\`javascript
function helloWorld() {
  console.log("Hello, developer!");
}
\`\`\`

### Example TikZ (will render as code):
\`\`\`latex
\\begin{tikzpicture}
  \\draw (0,0) -- (4,2);
\\end{tikzpicture}
\`\`\`
`;

function AITestPage() {
  const [markdownInput, setMarkdownInput] = useState(initialMarkdown);

  return (
    <div className="test-page-layout">
      <div className="test-input-container">
        <h2 className="test-page-title">AI Output Test Bench</h2>
        <textarea
          className="markdown-input-textarea"
          value={markdownInput}
          onChange={(e) => setMarkdownInput(e.target.value)}
          placeholder="Paste raw Markdown string from AI here..."
        />
      </div>

      <div className="results-scroll-container test-preview-container">
        <h2 className="test-page-title">Live Preview</h2>
        <div className="results-content markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{ code: CodeBlock }}
          >
            {markdownInput}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default AITestPage;