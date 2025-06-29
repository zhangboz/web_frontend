import React from 'react';

// --- HELPER FUNCTION ---
const formatDate = (dateString) => {
  if (!dateString) return '';
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};


// --- UPLOADER COMPONENT ---
function HomeworkUploader({ onFileSelect }) {
  const fileInputRef = React.useRef(null);
  const cameraInputRef = React.useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onFileSelect(file);
    }
    event.target.value = null;
  };

  return (
    <div className="container welcome-page">
      <h1>AI Homework Helper</h1>
      <p>Please select an image or PDF of your homework for analysis.</p>
      <input type="file" accept="image/*,application/pdf" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
      <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
      <div className="button-group">
        <button className="button" onClick={() => cameraInputRef.current.click()}>📸 Take a Picture</button>
        <button className="button" onClick={() => fileInputRef.current.click()}>📂 Select from File</button>
      </div>
    </div>
  );
}


// --- MAIN DASHBOARD PAGE COMPONENT ---
function DashboardPage({ user, isUpdatingSubscription, onLogout, onSubscribe, onCancelSubscription, onReactivateSubscription, onFileSelect }) {
  
  const periodEndDate = formatDate(user.currentPeriodEnd);

  const renderSubscriptionContent = () => {
    // Case 1: Active subscription with a pending cancellation
    if (user.subscriptionStatus === 'active' && user.cancelAtPeriodEnd) {
      return (
        <div>
          <p>Status: Active ✅ (Cancellation Pending)</p>
          <p>Your access will end on {periodEndDate}.</p>
          <button onClick={onReactivateSubscription} className="button accent-button" disabled={isUpdatingSubscription}>
            {isUpdatingSubscription ? 'Updating...' : 'Reactivate Subscription'}
          </button>
        </div>
      );
    }
    
    // Case 2: Fully active subscription
    if (user.subscriptionStatus === 'active') {
      return (
        <div>
          <p>Status: Active ✅</p>
          <p>Your next billing date is on {periodEndDate}.</p>
          <button onClick={onCancelSubscription} className="button secondary-button" disabled={isUpdatingSubscription}>
            {isUpdatingSubscription ? 'Updating...' : 'Cancel Subscription'}
          </button>
        </div>
      );
    }

    // Case 3: Incomplete payment
    if (user.subscriptionStatus === 'incomplete') {
        return (
            <div>
                <p>Status: Payment Incomplete ⚠️</p>
                <p>Please complete your payment to activate your subscription.</p>
                <button onClick={onSubscribe} className="button accent-button">
                    Complete Payment
                </button>
            </div>
        );
    }
    
    // Case 4: Default for 'inactive', 'canceled', or null status
    return (
      <div>
        <p>Status: Inactive ❌</p>
        <p>Unlock premium features by subscribing.</p>
        <button onClick={onSubscribe} className="button accent-button">
          Subscribe Now
        </button>
      </div>
    );
  };

  return (
    <div>
        <div className="user-header">
            <span>Welcome, {user.email}!</span>
            <button onClick={onLogout} className="button secondary-button">Logout</button>
        </div>

        <div className="subscription-section">
            <h3>Subscription</h3>
            {renderSubscriptionContent()}
        </div>

        <HomeworkUploader onFileSelect={onFileSelect} />
    </div>
  );
}

export default DashboardPage;