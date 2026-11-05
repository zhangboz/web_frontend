export const SUBSCRIPTION_UNAVAILABLE = 'Subscription status could not be verified. Please retry.';

export const isVerifiedSubscription = user => user?.subscriptionSource === 'stripe' &&
  user.subscriptionVerified === true && user.subscriptionSyncState === 'verified';

export const hasSubscriptionAccess = user => isVerifiedSubscription(user) &&
  ['active', 'trialing'].includes(user.subscriptionStatus);

export const canStartSubscription = user => user?.subscriptionSource === 'stripe' &&
  user.canSubscribe === true && (user.subscriptionSyncState === 'none' || isVerifiedSubscription(user));

// Keep account identity during a failed refresh, but never present the previous
// payment snapshot as a current Stripe result or use it to enable paid features.
export const withoutVerifiedSubscription = user => user ? {
  ...user, subscriptionSource: 'stripe', subscriptionStatus: 'unknown',
  subscriptionVerified: false, subscriptionSyncState: 'unavailable', subscriptionCheckedAt: null,
  currentPeriodEnd: null, cancelAtPeriodEnd: false, canManageSubscription: false, canSubscribe: false,
  subscriptionMessage: SUBSCRIPTION_UNAVAILABLE,
} : null;
