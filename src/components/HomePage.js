import React, { useRef } from 'react';
import './HomePage.css'; 

// --- SVG Icons ---
const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="feather feather-upload-cloud">
        <polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path><polyline points="16 16 12 12 8 16"></polyline>
    </svg>
);

function HomePage({ 
    onFileSelect, 
    language, 
    onLanguageChange, 
    user
}) {
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            onFileSelect(file);
        }
        event.target.value = null; // Reset for same-file selection
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            onFileSelect(files[0]);
        }
    };

    return (
        <div className="homepage-container">
            <div className="hero-section">
                <h1 className="hero-title">Homework Help AI</h1>
                <p className="hero-subtitle">Get instant, step-by-step solutions. Just upload a photo of your problem.</p>
                
                <div
                    className="upload-area"
                    onClick={() => fileInputRef.current.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="upload-icon-container"><UploadIcon /></div>
                    <p><strong>Drag & drop your file here</strong></p>
                    <p className="upload-area-subtext">or click to browse for an image or PDF</p>
                </div>

                <input type="file" accept="image/*,application/pdf" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
                <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

                <div className="divider">OR</div>
                
                <button className="button primary-button take-picture-button" onClick={() => cameraInputRef.current.click()}>
                    📸 Take a Picture with your Camera
                </button>

                <div className="language-selector-home">
                    <label htmlFor="language-select-home">AI Response Language:</label>
                    <select
                        id="language-select-home"
                        value={language}
                        onChange={(e) => onLanguageChange(e.target.value)}
                    >
                        <option value="en">English</option>
                        <option value="zh">Chinese</option>
                    </select>
                </div>

                {/* The save button is no longer needed as saving is automatic! */}
            </div>

            <div className="features-section">
                <h2 className="features-title">A Simpler Way to Solve Homework</h2>
                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-number">1</div>
                        <h3>Upload Your Problem</h3>
                        <p>Step 1: Take a picture or upload a PDF of your questions.</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-number">2</div>
                        <h3>Get an AI-Generated Answer</h3>
                        <p>Step 2: Our AI provides a clear, step-by-step solution instantly.</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-number">3</div>
                        <h3>Go Pro for More</h3>
                        <p>Step 3 (Pro): Get audio explanations and export solutions to Word.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default HomePage;