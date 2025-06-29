// src/components/FinalizingPage.js
import React from 'react';

const FinalizingPage = () => {
  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: '100px' }}>
      <div className="spinner"></div>
      <h2>Payment Successful!</h2>
      <p>Finalizing your subscription, please wait a moment...</p>
    </div>
  );
};

export default FinalizingPage;