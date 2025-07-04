// src/components/NotificationBanner.js
import React from 'react';
import './NotificationBanner.css'; // We'll create this file next

const NotificationBanner = ({ message, type = 'success', onClose }) => {
  if (!message) {
    return null;
  }

  return (
    <div className={`notification-banner notification-banner--${type}`}>
      <p className="notification-banner__message">{message}</p>
      <button onClick={onClose} className="notification-banner__close-button">
        ×
      </button>
    </div>
  );
};

export default NotificationBanner;