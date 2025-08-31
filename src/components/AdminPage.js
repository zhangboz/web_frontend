// src/components/AdminPage.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import './AdminPage.css';

// --- EXISTING HELPER FUNCTIONS ---
const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// --- NEW DB VIEWER HELPER ---
const truncate = (str, len = 40) => {
    if (str === null || typeof str === 'undefined') return 'NULL';
    const text = String(str);
    if (text.length <= len) return text;
    return text.substring(0, len) + '...';
};


// --- The Main AdminPage Component ---
const AdminPage = () => {
    const [activeTab, setActiveTab] = useState('uploader'); // 'uploader' or 'dbViewer'
    const token = localStorage.getItem('token');

    // --- RENDER FUNCTION ---
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


// --- Uploader Component (Existing Logic) ---
const FileUploader = ({ token }) => {
    const [folderName, setFolderName] = useState('');
    const [files, setFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    // useCallback to memoize the function definition
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
        formData.append('folderName', folderName);
        
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
            updateFileStatus(fileToProcess.id, 'processing', '2/4: Uploaded to GCS. Awaiting cloud function...');
        } catch (err) {
            console.error('Upload process error:', err);
            updateFileStatus(fileToProcess.id, 'error', `Error: ${err.message}`);
            return; 
        }

        if (!fullGcsPath) {
            updateFileStatus(fileToProcess.id, 'error', 'Error: Server did not return a file path.');
            return;
        }

        const controller = new AbortController();

        fetchEventSource(`${BACKEND_URL}/api/admin/status?fileName=${encodeURIComponent(fullGcsPath)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal,

            onopen(response) {
                if (response.ok) return; 
                updateFileStatus(fileToProcess.id, 'error', `Error: Auth failed (Code: ${response.status})`);
                controller.abort();
            },
            onmessage(event) {
                if (event.event === 'update') {
                    const data = JSON.parse(event.data);
                    updateFileStatus(fileToProcess.id, data.status, data.message);
                    if (data.status === 'complete' || data.status === 'error') {
                        controller.abort(); 
                    }
                }
            },
            onclose() {},
            onerror(err) {
                updateFileStatus(fileToProcess.id, 'error', 'Error: Status connection failed.');
                controller.abort(); 
                throw err;
            }
        });
    }, [folderName, token, updateFileStatus]);

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
        if (!folderName.trim()) { setError('Please provide a folder name.'); return; }
        if (files.filter(f => f.status === 'waiting').length === 0) { setError('No files are waiting for upload.'); return; }
        setError('');
        setIsUploading(true);
    };

    const getStatusClass = (status) => `status-${status}`;
    
    return (
         <>
            <p>Upload files to be processed and stored in the knowledge base.</p>
            <div className="upload-controls">
                <div className="form-group">
                    <label htmlFor="folderName">Target Folder Name (in GCS)</label>
                    <input type="text" id="folderName" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g., MATH-302-Lecture-Notes" disabled={isUploading}/>
                </div>
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


// --- NEW Database Viewer Component ---
const DbViewer = ({ token }) => {
    const [tables, setTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState(null); // { name, structure, data, totalRows }
    const [currentPage, setCurrentPage] = useState(1);
    const [filterInput, setFilterInput] = useState('');
    const [activeFilter, setActiveFilter] = useState('');
    const [selectedCell, setSelectedCell] = useState(null); // { content, column, row }
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchTables = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`${BACKEND_URL}/api/admin/db/tables`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Could not fetch table list.');
                const data = await res.json();
                setTables(data.tables);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTables();
    }, [token]);

    const fetchTableData = useCallback(async (tableName, page = 1, filter = '') => {
        setIsLoading(true);
        setError('');
        try {
            const url = new URL(`${BACKEND_URL}/api/admin/db/tables/${tableName}`);
            url.searchParams.append('page', page);
            if (filter) {
                url.searchParams.append('filter', filter);
            }

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || `Could not fetch data for table ${tableName}.`);
            
            setSelectedTable(data);
            setCurrentPage(page);
            setActiveFilter(filter);
        } catch (err) {
            setError(err.message);
            setSelectedTable(null); // Clear table on error
        } finally {
            setIsLoading(false);
        }
    }, [token]);
    
    const handleTableSelect = (tableName) => {
        setFilterInput(''); // Reset input field
        fetchTableData(tableName, 1, '');
    };

    const handleFilterSubmit = (e) => {
        e.preventDefault();
        if (selectedTable) {
            fetchTableData(selectedTable.tableName, 1, filterInput);
        }
    };
    
    const handlePageChange = (newPage) => {
        if (selectedTable) {
            fetchTableData(selectedTable.tableName, newPage, activeFilter);
        }
    };

    const handleBackToTables = () => {
        setSelectedTable(null);
        setFilterInput('');
        setActiveFilter('');
        setCurrentPage(1);
        setError('');
    };
    
    const renderPagination = () => {
        if (!selectedTable || !selectedTable.totalRows) return null;

        const { totalRows } = selectedTable;
        const limit = 100;
        const totalPages = Math.ceil(totalRows / limit);

        if (totalPages <= 1) return null;

        const startRow = (currentPage - 1) * limit + 1;
        const endRow = Math.min(currentPage * limit, totalRows);

        return (
            <div className="pagination-controls">
                <span>Rows {startRow}-{endRow} of {totalRows}</span>
                <div className="pagination-buttons">
                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
                        &larr; Previous
                    </button>
                    <span>Page {currentPage} of {totalPages}</span>
                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>
                        Next &rarr;
                    </button>
                </div>
            </div>
        );
    };

    if (isLoading) return <div className="spinner"></div>;
    if (error && !selectedTable) return <p className="error-message">{error}</p>;

    return (
        <div className="db-viewer">
            {selectedCell && (
                <div className="cell-modal-overlay" onClick={() => setSelectedCell(null)}>
                    <div className="cell-modal-content" onClick={e => e.stopPropagation()}>
                        <button className="close-modal-button" onClick={() => setSelectedCell(null)}>×</button>
                        <h3>Content from <code>{selectedTable.tableName}.{selectedCell.column}</code></h3>
                        <pre>{String(selectedCell.content)}</pre>
                    </div>
                </div>
            )}

            {!selectedTable ? (
                <>
                    <h2>Database Tables</h2>
                    <ul className="db-table-list">
                        {tables.map(name => (
                            <li key={name}>
                                <button onClick={() => handleTableSelect(name)}>{name}</button>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <div className="table-view-container">
                    <button className="back-button" onClick={handleBackToTables}>&larr; Back to Tables</button>
                    <h2>Table: <strong>{selectedTable.tableName}</strong></h2>

                    <div className="db-controls">
                         <form onSubmit={handleFilterSubmit} className="filter-form">
                            <input
                                type="text"
                                value={filterInput}
                                onChange={(e) => setFilterInput(e.target.value)}
                                placeholder="e.g., id > 10 AND summary ILIKE '%topic%' AND status IN ('a', 'b')"
                            />
                            <button type="submit">Filter</button>
                            {activeFilter && <button type="button" className="clear-filter-button" onClick={() => handleTableSelect(selectedTable.tableName)}>Clear</button>}
                        </form>
                        {renderPagination()}
                    </div>
                    {error && <p className="error-message">{error}</p>}
                    
                    <h3>Structure</h3>
                    <pre className="table-structure">
                        {selectedTable.structure.map(col =>
                            `${col.column_name.padEnd(25)} ${col.data_type}`
                        ).join('\n')}
                    </pre>

                    <h3>Data ({selectedTable.totalRows} total rows)</h3>
                    <div className="data-table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    {selectedTable.data.length > 0 && Object.keys(selectedTable.data[0]).map(header => (
                                        <th key={header}>{header}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {selectedTable.data.length === 0 && (
                                    <tr><td colSpan={selectedTable.structure.length || 1}>No data found for this filter.</td></tr>
                                )}
                                {selectedTable.data.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {Object.entries(row).map(([key, value]) => (
                                            <td key={key} onClick={() => setSelectedCell({ content: value, column: key, row: rowIndex })}>
                                                {truncate(value)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;