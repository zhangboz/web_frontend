// src/components/PreviewPage.js
import React from 'react';

function PreviewPage({ file, previewUrl, onConfirm, onBack }) {
  if (!file) {
    // Should ideally not happen if handleFileSelect in App.js is robust,
    // but good for safety.
    return (
      <div className="container">
        <h2>No file selected.</h2>
        <button onClick={onBack} className="button">Return to Home</button>
      </div>
    );
  }

  return (
    <div className="container preview-page">
      <h2>Preview Selected File</h2>
      <div className="file-preview-area">
        {file.type.startsWith('image/') && previewUrl ? (
          // Display image preview for image files
          <img src={previewUrl} alt="Homework Preview" className="image-preview" />
        ) : (
          // Display filename for PDF files
          <p className="file-name-display">Selected PDF: <strong>{file.name}</strong></p>
        )}
      </div>
      <p className="file-size-display">Size: {(file.size / (1024 * 1024)).toFixed(2)} MB</p>

      <div className="button-group">
        <button onClick={onConfirm} className="button primary-button">
          ⬆️ Confirm Upload
        </button>
        <button onClick={onBack} className="button secondary-button">
          ↩️ Change File
        </button>
      </div>
    </div>
  );
}

export default PreviewPage;