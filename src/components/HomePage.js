// src/components/HomePage.js
import React from 'react';

// This component is the main "action" screen of the app.
function HomeworkUploader({ onFileSelect }) {
  const fileInputRef = React.useRef(null);
  const cameraInputRef = React.useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onFileSelect(file);
    }
    event.target.value = null;
  };

  return (
    <div className="container welcome-page">
      <h1>AI Homework Helper</h1>
      <p>Please select an image or PDF of your homework for analysis.</p>
      <input type="file" accept="image/*,application/pdf" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
      <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
      <div className="button-group">
        <button className="button primary-button" onClick={() => cameraInputRef.current.click()}>📸 Take a Picture</button>
        <button className="button" onClick={() => fileInputRef.current.click()}>📂 Select from File</button>
      </div>
    </div>
  );
}

function HomePage({ onFileSelect }) {
  return (
    <div>
      <HomeworkUploader onFileSelect={onFileSelect} />
    </div>
  );
}

export default HomePage;