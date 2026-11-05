import React from 'react';
import './AccountPage.css';
import { canStartSubscription, hasSubscriptionAccess, isVerifiedSubscription, SUBSCRIPTION_UNAVAILABLE } from '../utils/subscription';

const futureDate = value => {
  const date = Date.parse(value);
  return Number.isFinite(date) && date > Date.now()
    ? new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;
};

const statusLabels = { canceled: 'Canceled', incomplete: 'Payment Incomplete', incomplete_expired: 'Payment Expired',
  past_due: 'Payment Past Due', unpaid: 'Unpaid', paused: 'Paused', inactive: 'Inactive' };

function AccountPage({ user, isUpdatingSubscription, isRefreshingSubscription = false, subscriptionError,
  onRefreshSubscription, onLogout, onSubscribe, onCancelSubscription, onReactivateSubscription }) {
  const periodEndDate = futureDate(user?.currentPeriodEnd);
  const verified = isVerifiedSubscription(user);
  const canSubscribe = canStartSubscription(user);

  const renderSubscriptionContent = () => {
    if (isRefreshingSubscription) return <div className="subscription-card" role="status">
      <p>Checking subscription status…</p>
    </div>;

    if (subscriptionError || (!verified && user?.subscriptionSyncState !== 'none')) return (
      <div className="subscription-card">
        <p className="status-text" role="status">Subscription status unavailable</p>
        <p>{subscriptionError || user?.subscriptionMessage || SUBSCRIPTION_UNAVAILABLE}</p>
        <button onClick={onRefreshSubscription} className="button secondary-button">Retry status check</button>
      </div>
    );

    if (hasSubscriptionAccess(user)) return (
      <div className="subscription-card">
        <p className="status-text active">Status: {user.subscriptionStatus === 'trialing' ? 'Trial' : 'Active'} ✅{user.cancelAtPeriodEnd ? ' (Cancellation Pending)' : ''}</p>
        {periodEndDate ? <p>{user.cancelAtPeriodEnd ? 'Your access will end' : user.subscriptionStatus === 'trialing'
          ? 'Your trial ends' : 'Your next billing date is'} on {periodEndDate}.</p>
          : <p>{user.cancelAtPeriodEnd ? 'Cancellation is scheduled. The end date is not currently available.' : 'The next billing date is not currently available.'}</p>}
        {user.subscriptionMessage && <p>{user.subscriptionMessage}</p>}
        {user.canManageSubscription === true && <button
          onClick={user.cancelAtPeriodEnd ? onReactivateSubscription : onCancelSubscription}
          className={`button ${user.cancelAtPeriodEnd ? 'primary-button' : 'secondary-button'}`} disabled={isUpdatingSubscription}>
          {isUpdatingSubscription ? 'Updating...' : user.cancelAtPeriodEnd ? 'Reactivate Subscription' : 'Cancel Subscription'}
        </button>}
      </div>
    );

    const incomplete = verified && user.subscriptionStatus === 'incomplete';
    return (
      <div className="subscription-card">
        <p className={`status-text ${incomplete ? 'incomplete' : 'inactive'}`}>Status: {statusLabels[user?.subscriptionStatus] || 'Inactive'}</p>
        {user?.subscriptionMessage && <p>{user.subscriptionMessage}</p>}
        {canSubscribe && <>
          <p>{incomplete ? 'Complete your payment to activate your subscription.' : 'Start your 7-day trial with the Premium plan.'}</p>
          <div className="premium-features-promo">
            <h4>What you get with Premium:</h4>
            <ul className="premium-features-list">
              <li>✅ Get step-by-step audio explanations from an AI Tutor.</li>
              <li>✅ Export solutions to editable Word documents for your notes.</li>
              <li>✅ Unlock advanced analysis for complex problems (Coming Soon!).</li>
            </ul>
          </div>
          <button onClick={() => onSubscribe('/account')} className="button primary-button" disabled={isUpdatingSubscription}>
            {incomplete ? 'Complete Payment' : 'Subscribe Now'}
          </button>
        </>}
      </div>
    );
  };

  return (
    <div className="account-page-container">
      <h2>My Account</h2>
      {user?.email && <div className="account-info-card">
        <h3>Account Details</h3>
        <p><strong>Email:</strong> {user.email}</p>
      </div>}
      <div className="account-info-card">
        <h3>Subscription</h3>
        {renderSubscriptionContent()}
        {!isRefreshingSubscription && !subscriptionError && (verified || user?.subscriptionSyncState === 'none') &&
          <button onClick={onRefreshSubscription} className="button secondary-button" disabled={isUpdatingSubscription}>Refresh subscription status</button>}
      </div>
      <button onClick={onLogout} className="button logout-button">Logout</button>
    </div>
  );
}

export default AccountPage;
