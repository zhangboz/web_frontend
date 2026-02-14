// src/components/AdminPage/index.js
import React, { useState } from 'react';
import './AdminPage.css';

// Import the modularized components
import FileUploader from './FileUploader';
import DbViewer from './DbViewer';

const AdminPage = () => {
    const [activeTab, setActiveTab] = useState('uploader'); // 'uploader' or 'dbViewer'
    const token = localStorage.getItem('token');

    return (
        <div className="admin-container">
            <h1>Admin Panel</h1>
            <div className="admin-tabs">
                <button
                    className={`tab-button ${activeTab === 'uploader' ? 'active' : ''}`}
                    onClick={() => setActiveTab('uploader')}
                >
                    Course File Uploader
                </button>
                <button
                    className={`tab-button ${activeTab === 'dbViewer' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dbViewer')}
                >
                    Database Viewer
                </button>
            </div>

            <div className="admin-tab-content">
                {activeTab === 'uploader' && <FileUploader token={token} />}
                {activeTab === 'dbViewer' && <DbViewer token={token} />}
            </div>
        </div>
    );
};

export default AdminPage;