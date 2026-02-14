// src/components/AdminPage/FileUploader.js

import React, { useState, useRef, useCallback, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
});

const FileUploader = ({ token }) => {
    const [metadata, setMetadata] = useState({
        institution: '',    // Corresponds to short_name
        department: '',
        courseCode: '',
        professorFirstName: '',
        professorLastName: '',
        year: '',
        semester: ''
    });
    const [files, setFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    const handleMetadataChange = (e) => {
        const { name, value } = e.target;
        setMetadata(prev => ({ ...prev, [name]: value }));
    };

    const updateFileStatus = useCallback((id, status, message) => {
        setFiles(prevFiles =>
            prevFiles.map(f =>
                f.id === id ? { ...f, status, message } : f
            )
        );
    }, []);

    const uploadAndMonitorFile = useCallback(async (fileToProcess) => {
        updateFileStatus(fileToProcess.id, 'uploading', '1/4: Uploading to server...');
        const formData = new FormData();
        formData.append('courseFile', fileToProcess.file);
        
        Object.entries(metadata).forEach(([key, value]) => {
            if (value) { // Only append if value is not empty
                formData.append(key, value);
            }
        });
        
        let fullGcsPath; 

        try {
            const uploadResponse = await fetch(`${BACKEND_URL}/api/admin/upload-to-gcs`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });

            const uploadData = await uploadResponse.json();
            if (!uploadResponse.ok) {
                throw new Error(uploadData.message || 'Initial upload failed.');
            }
            
            fullGcsPath = uploadData.fullGcsPath;
        } catch (err) {
            console.error('Upload process error:', err);
            updateFileStatus(fileToProcess.id, 'error', `Error: ${err.message}`);
            return; 
        }

        if (!fullGcsPath) {
            updateFileStatus(fileToProcess.id, 'error', 'Error: Server did not return a file path.');
            return;
        }

        let intervalId = null;
        const POLLING_INTERVAL = 8000;
        const POLLING_TIMEOUT = 15 * 60 * 1000;

        const pollTimeout = setTimeout(() => {
            clearInterval(intervalId);
            updateFileStatus(fileToProcess.id, 'error', 'Error: Processing timed out after 15 minutes.');
        }, POLLING_TIMEOUT);

        const pollStatus = async () => {
            try {
                const statusUrl = new URL(`${BACKEND_URL}/api/admin/status`);
                statusUrl.searchParams.append('fullGcsPath', fullGcsPath);

                const res = await fetch(statusUrl.toString(), {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!res.ok) {
                     updateFileStatus(fileToProcess.id, 'error', `Error: Status check failed (Code: ${res.status})`);
                     clearInterval(intervalId);
                     clearTimeout(pollTimeout);
                     return;
                }
                const data = await res.json();
                
                updateFileStatus(fileToProcess.id, data.status, data.message);

                if (data.status === 'complete' || data.status === 'error') {
                    clearInterval(intervalId);
                    clearTimeout(pollTimeout);
                }
            } catch (err) {
                 console.error('Polling error:', err);
                 updateFileStatus(fileToProcess.id, 'error', 'Error: Status connection failed.');
                 clearInterval(intervalId);
                 clearTimeout(pollTimeout);
            }
        };

        pollStatus(); 
        intervalId = setInterval(pollStatus, POLLING_INTERVAL);
        
    }, [metadata, token, updateFileStatus]);

    useEffect(() => {
        if (!isUploading) return;
        const isProcessing = files.some(f => ['uploading', 'processing'].includes(f.status));
        if (isProcessing) return;
        const nextFile = files.find(f => f.status === 'waiting');
        if (nextFile) {
            uploadAndMonitorFile(nextFile);
        } else {
            setIsUploading(false);
        }
    }, [isUploading, files, uploadAndMonitorFile]);

    const handleFileSelect = (event) => {
        const selectedFiles = Array.from(event.target.files);
        const newFileQueue = selectedFiles.map(file => ({
            id: generateUUID(), file, status: 'waiting', message: 'Waiting in queue...',
        }));
        setFiles(prevFiles => [...prevFiles, ...newFileQueue]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleStartUpload = () => {
        if (!metadata.institution || !metadata.department || !metadata.courseCode) {
            setError('Please fill in all mandatory metadata fields.');
            return;
        }
        if (files.filter(f => f.status === 'waiting').length === 0) {
            setError('No files are waiting for upload.');
            return;
        }
        setError('');
        setIsUploading(true);
    };

    const getStatusClass = (status) => `status-${status}`;
    
    return (
         <>
            <p>Upload files to be processed and stored in the knowledge base.</p>
            <div className="metadata-form">
                <div className="form-row">
                    <div className="form-group mandatory">
                        <label htmlFor="institution">Institution Short Name</label>
                        <input type="text" id="institution" name="institution" value={metadata.institution} onChange={handleMetadataChange} placeholder="e.g., UBC" disabled={isUploading} required/>
                    </div>
                    <div className="form-group mandatory">
                        <label htmlFor="department">Department</label>
                        <input type="text" id="department" name="department" value={metadata.department} onChange={handleMetadataChange} placeholder="e.g., Mathematics" disabled={isUploading} required/>
                    </div>
                    <div className="form-group mandatory">
                        <label htmlFor="courseCode">Course Code</label>
                        <input type="text" id="courseCode" name="courseCode" value={metadata.courseCode} onChange={handleMetadataChange} placeholder="e.g., MATH100" disabled={isUploading} required/>
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor="professorFirstName">Professor First Name (Optional)</label>
                        <input type="text" id="professorFirstName" name="professorFirstName" value={metadata.professorFirstName} onChange={handleMetadataChange} placeholder="e.g., John" disabled={isUploading}/>
                    </div>
                    <div className="form-group">
                        <label htmlFor="professorLastName">Professor Last Name (Optional)</label>
                        <input type="text" id="professorLastName" name="professorLastName" value={metadata.professorLastName} onChange={handleMetadataChange} placeholder="e.g., Doe" disabled={isUploading}/>
                    </div>
                     <div className="form-group">
                        <label htmlFor="year">Year (Optional)</label>
                        <input type="number" id="year" name="year" value={metadata.year} onChange={handleMetadataChange} placeholder="e.g., 2024" disabled={isUploading}/>
                    </div>
                     <div className="form-group">
                        <label htmlFor="semester">Semester (Optional)</label>
                        <select id="semester" name="semester" value={metadata.semester} onChange={handleMetadataChange} disabled={isUploading}>
                            <option value="">Select...</option>
                            <option value="Fall">Fall</option>
                            <option value="Winter">Winter</option>
                            <option value="Spring">Spring</option>
                            <option value="Summer">Summer</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div className="upload-controls">
                 <div className="form-group">
                    <label htmlFor="file-upload" className="file-upload-label">Select Files...</label>
                    <input id="file-upload" type="file" multiple onChange={handleFileSelect} ref={fileInputRef} disabled={isUploading}/>
                </div>
                <button onClick={handleStartUpload} disabled={isUploading || files.length === 0} className="upload-button">
                    {isUploading ? 'Uploading...' : 'Start Upload Queue'}
                </button>
            </div>
            {error && <p className="error-message">{error}</p>}
            <div className="file-queue">
                <h2>Upload Queue ({files.length} files)</h2>
                {files.length === 0 && <p>Select files to begin.</p>}
                <ul>
                    {files.map(item => (
                        <li key={item.id} className={`queue-item ${getStatusClass(item.status)}`}>
                           <span className="file-name">{item.file.name}</span>
                           <span className="file-status">{item.message}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
};

export default FileUploader;