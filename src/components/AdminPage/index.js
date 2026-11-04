// src/components/AdminPage/index.js
import React from 'react';
import './AdminPage.css';

// Import the modularized components
import DbViewer from './DbViewer';

const AdminPage = () => {
    const token = localStorage.getItem('token');

    return (
        <div className="admin-container">
            <h1>Admin Panel</h1>
            <p>Textbook uploads are temporarily unavailable.</p>

            <div className="admin-tab-content">
                <DbViewer token={token} />
            </div>
        </div>
    );
};

export default AdminPage;
