// src/App.js
import React, { useState } from 'react';
import './App.css';

// Import the step components
import WelcomePage from './components/WelcomePage';
import PreviewPage from './components/PreviewPage';
import WaitingPage from './components/WaitingPage.js';
import ResultsPage from './components/ResultsPage';

// Define the backend URL using an environment variable
// For local development, you can create a .env file in web_frontend/
// like REACT_APP_BACKEND_URL=http://localhost:5000
// For Render, you'll set this in the Static Site environment variables.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

function App() {
  const [currentStep, setCurrentStep] = useState('welcome');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [aiResponse, setAiResponse] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleFileSelect = (file) => {
    setErrorMessage('');
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage('File is too large. Please select a file smaller than 10MB.');
        setSelectedFile(null);
        setPreviewUrl(null);
        setCurrentStep('error');
        return;
      }

      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result);
          setCurrentStep('preview');
        };
        reader.readAsDataURL(file);
      } else if (file.type === 'application/pdf') {
        setPreviewUrl(null);
        setCurrentStep('preview');
      } else {
        setErrorMessage('Unsupported file type. Please select an image or PDF file.');
        setSelectedFile(null);
        setPreviewUrl(null);
        setCurrentStep('error');
      }
    } else {
      setSelectedFile(null);
      setPreviewUrl(null);
      setCurrentStep('welcome');
    }
  };

  const handleUploadConfirm = async () => {
    if (!selectedFile) {
      setErrorMessage('No file selected for upload.');
      setCurrentStep('error');
      return;
    }

    setCurrentStep('waiting');
    setErrorMessage('');

    const formData = new FormData();
    formData.append('homeworkImage', selectedFile);

    try {
      // Use the dynamic BACKEND_URL here
      const response = await fetch(`${BACKEND_URL}/api/process-homework`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Network response was not ok.');
      }

      const data = await response.json();
      if (data.success) {
        setAiResponse(data.reply);
        setCurrentStep('results');
      } else {
        throw new Error(data.message || 'AI processing failed.');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setErrorMessage(`文件上传或处理失败: ${error.message}`);
      setCurrentStep('error');
    }
  };

  const resetApp = () => {
    setCurrentStep('welcome');
    setSelectedFile(null);
    setPreviewUrl(null);
    setAiResponse('');
    setErrorMessage('');
  };

  const renderContent = () => {
    if (errorMessage) {
      return (
        <div className="container error-container">
          <h2>Error!</h2>
          <p className="error-message">{errorMessage}</p>
          <button onClick={resetApp} className="button">Return to Home</button>
        </div>
      );
    }

    switch (currentStep) {
      case 'welcome':
        return <WelcomePage onFileSelect={handleFileSelect} />;
      case 'preview':
        return (
          <PreviewPage
            file={selectedFile}
            previewUrl={previewUrl}
            onConfirm={handleUploadConfirm}
            onBack={resetApp}
          />
        );
      case 'waiting':
        return (
          <WaitingPage
            file={selectedFile}
            previewUrl={previewUrl}
          />
        );
      case 'results':
        return <ResultsPage response={aiResponse} onReset={resetApp} backendUrl={BACKEND_URL} />; // Pass backendUrl
      case 'error':
        return (
          <div className="container error-container">
            <h2>Something went wrong!</h2>
            <p className="error-message">{errorMessage}</p>
            <button onClick={resetApp} className="button">Start Over</button>
          </div>
        );
      default:
        return <WelcomePage onFileSelect={handleFileSelect} />;
    }
  };

  return (
    <div className="App">
      {renderContent()}
    </div>
  );
}

export default App;