import React from 'react';
import './AccountPage.css';

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

function AccountPage({ user, isUpdatingSubscription, onLogout, onSubscribe, onCancelSubscription, onReactivateSubscription }) {
  
  if (!user) {
    return <div className="spinner"></div>;
  }

  const periodEndDate = formatDate(user.currentPeriodEnd);

  const renderSubscriptionContent = () => {
    if (user.subscriptionStatus === 'active' && user.cancelAtPeriodEnd) {
      return (
        <div className="subscription-card">
          <p className="status-text active">Status: Active ✅ (Cancellation Pending)</p>
          <p>Your access will end on {periodEndDate}.</p>
          <button onClick={onReactivateSubscription} className="button primary-button" disabled={isUpdatingSubscription}>
            {isUpdatingSubscription && user.intendedAction === 'reactivate' ? 'Updating...' : 'Reactivate Subscription'}
          </button>
        </div>
      );
    }
    
    if (user.subscriptionStatus === 'active') {
      return (
        <div className="subscription-card">
          <p className="status-text active">Status: Active ✅</p>
          <p>Your next billing date is on {periodEndDate}.</p>
          <button onClick={onCancelSubscription} className="button secondary-button" disabled={isUpdatingSubscription}>
            {isUpdatingSubscription && user.intendedAction === 'cancel' ? 'Updating...' : 'Cancel Subscription'}
          </button>
        </div>
      );
    }

    const premiumFeatures = (
      <div className="premium-features-promo">
          <h4>What you get with Premium:</h4>
          <ul className="premium-features-list">
              <li>✅ Get step-by-step audio explanations from an AI Tutor.</li>
              <li>✅ Export solutions to editable Word documents for your notes.</li>
              <li>✅ Unlock advanced analysis for complex problems (Coming Soon!).</li>
          </ul>
      </div>
    );

    if (user.subscriptionStatus === 'incomplete') {
        return (
          <div className="subscription-card">
                <p className="status-text incomplete">Status: Payment Incomplete ⚠️</p>
                <p>Please complete your payment to activate your subscription.</p>
                {premiumFeatures}
                <button onClick={() => onSubscribe('/account')} className="button primary-button">
                    Complete Payment
                </button>
            </div>
        );
    }
    
    return (
      <div className="subscription-card">
        <p className="status-text inactive">Status: Inactive ❌</p>
        <p>Unlock all features by subscribing to a premium plan.</p>
        {premiumFeatures}
        <button onClick={() => onSubscribe('/account')} className="button primary-button">
          Subscribe Now
        </button>
      </div>
    );
  };

  return (
    <div className="account-page-container">
        <h2>My Account</h2>
        <div className="account-info-card">
            <h3>Account Details</h3>
            <p><strong>Email:</strong> {user.email}</p>
        </div>
        
        <div className="account-info-card">
            <h3>Subscription</h3>
            {renderSubscriptionContent()}
        </div>

        <button onClick={onLogout} className="button logout-button">Logout</button>
    </div>
  );
}

export default AccountPage;