// src/components/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
    const ADMIN_USER_ID = 4;
    let user = null;

    try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            user = JSON.parse(storedUser);
        }
    } catch (e) {
        console.error("Failed to parse user from localStorage", e);
        // Handle error or clear invalid item
        localStorage.removeItem('user');
    }

    if (!user || user.id !== ADMIN_USER_ID) {
        // If user is not logged in or is not the admin, redirect to home page.
        // You can also show an "Access Denied" component here instead.
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;