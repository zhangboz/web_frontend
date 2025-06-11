// src/App.js
import React, { useState } from 'react';
import './App.css';

// Import the step components
import WelcomePage from './components/WelcomePage';
import PreviewPage from './components/PreviewPage';
import WaitingPage from './components/WaitingPage.js'; // Assuming WaitingPage.js (not .jsx)
import ResultsPage from './components/ResultsPage';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

function App() {
  const [currentStep, setCurrentStep] = useState('welcome');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  // MODIFICATION 1: Initialize aiResponse to null (or an empty object {})
  // This state will now hold an object like { reply1: '...', reply2: '...' }
  const [aiResponse, setAiResponse] = useState(null);
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
        setPreviewUrl(null); // No direct preview for PDF in this setup
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
        // MODIFICATION 2: Store both reply1 and reply2
        setAiResponse({ reply1: data.reply1, reply2: data.reply2 });
        console.log('Backend response data:', data); // You can see reply1 and reply2 here
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
    // MODIFICATION 3: Reset aiResponse to its initial state (null)
    setAiResponse(null);
    setErrorMessage('');
  };

  const renderContent = () => {
    if (errorMessage && currentStep === 'error') { // Ensure error message is only for 'error' step if intended
      return (
        <div className="container error-container">
          <h2>Error!</h2>
          <p className="error-message">{errorMessage}</p>
          <button onClick={resetApp} className="button">Return to Home</button>
        </div>
      );
    }
    // Handle general error display if needed outside specific 'error' step
    // if (errorMessage && currentStep !== 'error') {
    //   return <p>An error occurred: {errorMessage}. <button onClick={resetApp}>Try again</button></p>;
    // }


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
        // No change here, aiResponse (which is now an object) is passed
        return <ResultsPage response={aiResponse} onReset={resetApp} backendUrl={BACKEND_URL} />;
      case 'error': // This case already exists and handles errors correctly
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