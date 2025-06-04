// src/components/WelcomePage.js
import React, { useRef } from 'react';

function WelcomePage({ onFileSelect }) {
  // Create refs for the hidden file inputs to trigger them programmatically
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    onFileSelect(file);
    // Clear the input value so that selecting the same file twice triggers onChange
    event.target.value = null;
  };

  return (
    <div className="container welcome-page">
      <h1>AI Homework Helper</h1>
      <p>Please select an image or PDF of your homework for analysis.</p>

      {/* Hidden file input for "Select from File" */}
      <input
        type="file"
        accept="image/*,application/pdf" // Accept all image types and PDF
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }} // Hide the actual input element
      />

      {/* Hidden file input for "Take a Picture" */}
      <input
        type="file"
        accept="image/*" // Only images can be taken by camera
        capture="environment" // Hint to use the device's main camera (rear-facing)
        ref={cameraInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }} // Hide the actual input element
      />

      <div className="button-group">
        <button className="button" onClick={() => cameraInputRef.current.click()}>
          📸 Take a Picture
        </button>
        <button className="button" onClick={() => fileInputRef.current.click()}>
          📂 Select from File
        </button>
      </div>
    </div>
  );
}

export default WelcomePage;