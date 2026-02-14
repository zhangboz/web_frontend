// src/components/AdminPage/DbViewer.js

import React, { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const truncate = (str, len = 40) => {
    if (str === null || typeof str === 'undefined') return 'NULL';
    const text = String(str);
    if (text.length <= len) return text;
    return text.substring(0, len) + '...';
};

const DbViewer = ({ token }) => {
    const [tables, setTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [filterInput, setFilterInput] = useState('');
    const [activeFilter, setActiveFilter] = useState('');
    const [selectedCell, setSelectedCell] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // --- NEW STATE FOR DELETION ---
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

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
            setSelectedRows(new Set()); // Clear selection on new data fetch
        } catch (err) {
            setError(err.message);
            setSelectedTable(null);
        } finally {
            setIsLoading(false);
        }
    }, [token]);
    
    const handleTableSelect = (tableName) => {
        setFilterInput('');
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

    // --- NEW DELETION HANDLERS ---
    const getRowId = (row) => {
        if (!row) return null;
        // Assumption: the first column is the primary key. The backend validates this.
        const pkColumn = Object.keys(row)[0];
        return row[pkColumn];
    };

    const handleRowSelect = (rowId) => {
        const newSelection = new Set(selectedRows);
        if (newSelection.has(rowId)) {
            newSelection.delete(rowId);
        } else {
            newSelection.add(rowId);
        }
        setSelectedRows(newSelection);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allRowIds = selectedTable.data.map(row => getRowId(row));
            setSelectedRows(new Set(allRowIds));
        } else {
            setSelectedRows(new Set());
        }
    };
    
    const handleDeleteRequest = async () => {
        if (deleteConfirmInput !== 'confirm delete') return;

        setIsLoading(true);
        setError('');
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/db/tables/${selectedTable.tableName}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ primaryKeys: Array.from(selectedRows) })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to delete rows.');

            // Success! Close modal, clear inputs, and refresh data.
            setIsDeleteModalOpen(false);
            setDeleteConfirmInput('');
            await fetchTableData(selectedTable.tableName, currentPage, activeFilter);
            // Optionally show a success message to the user
            alert(data.message); 

        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
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

    const isAllSelected = selectedTable && selectedRows.size === selectedTable.data.length && selectedTable.data.length > 0;

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
            
            {/* --- NEW: DELETE CONFIRMATION MODAL --- */}
            {isDeleteModalOpen && (
                 <div className="cell-modal-overlay">
                    <div className="cell-modal-content delete-modal">
                        <h3>Confirm Deletion</h3>
                        <p>This action is irreversible. You are about to delete <strong>{selectedRows.size}</strong> row(s) from the <strong>{selectedTable.tableName}</strong> table.</p>
                        <p>Please type <code>confirm delete</code> to proceed.</p>
                        <input
                            type="text"
                            value={deleteConfirmInput}
                            onChange={(e) => setDeleteConfirmInput(e.target.value)}
                            placeholder="confirm delete"
                        />
                        <div className="modal-actions">
                            <button onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                            <button
                                className="delete-confirm-button"
                                onClick={handleDeleteRequest}
                                disabled={deleteConfirmInput !== 'confirm delete'}
                            >
                                Delete
                            </button>
                        </div>
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
                                placeholder="e.g., id > 10 AND summary ILIKE '%topic%'"
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

                    {/* --- NEW: DELETE BUTTON --- */}
                    <div className="table-actions">
                        {selectedRows.size > 0 && (
                            <button className="delete-button" onClick={() => setIsDeleteModalOpen(true)}>
                                Delete {selectedRows.size} Selected Row(s)
                            </button>
                        )}
                    </div>

                    <h3>Data ({selectedTable.totalRows} total rows)</h3>
                    <div className="data-table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    {/* --- NEW: SELECT ALL CHECKBOX --- */}
                                    <th>
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            onChange={handleSelectAll}
                                            disabled={selectedTable.data.length === 0}
                                        />
                                    </th>
                                    {selectedTable.data.length > 0 && Object.keys(selectedTable.data[0]).map(header => (
                                        <th key={header}>{header}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {selectedTable.data.length === 0 && (
                                    <tr><td colSpan={(selectedTable.structure.length || 0) + 1}>No data found for this filter.</td></tr>
                                )}
                                {selectedTable.data.map((row, rowIndex) => {
                                    const rowId = getRowId(row);
                                    const isSelected = selectedRows.has(rowId);
                                    return (
                                        <tr key={rowId || rowIndex} className={isSelected ? 'selected-row' : ''}>
                                            {/* --- NEW: ROW SELECTION CHECKBOX --- */}
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleRowSelect(rowId)}
                                                />
                                            </td>
                                            {Object.entries(row).map(([key, value]) => (
                                                <td key={key} onClick={() => setSelectedCell({ content: value, column: key, row: rowIndex })}>
                                                    {truncate(value)}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DbViewer;