// src/components/WaitingPage.js
import React from 'react';

function WaitingPage({ file, previewUrl }) {
  return (
    <div className="container waiting-page">
      <h2>Picture being processed...</h2>
      <div className="file-preview-area">
        {file && file.type.startsWith('image/') && previewUrl ? (
          // Display image preview if available
          <img src={previewUrl} alt="Homework Preview" className="image-preview" />
        ) : file ? (
          // Display filename for PDF or if image preview is not available
          <p className="file-name-display">Processing PDF: <strong>{file.name}</strong></p>
        ) : (
          // Fallback message if file state is unexpectedly null
          <p>Loading file details...</p>
        )}
      </div>
      <p className="loading-message">This may take some time, please wait patiently.</p>
      <div className="spinner"></div> {/* Simple CSS spinner for visual feedback */}
    </div>
  );
}

export default WaitingPage;