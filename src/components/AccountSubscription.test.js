import { fireEvent, render, screen } from '@testing-library/react';
import AccountPage from './AccountPage';
import { hasSubscriptionAccess } from '../utils/subscription';

const current = { id: 42, email: 'student@example.invalid', subscriptionStatus: 'active',
  subscriptionSource: 'stripe', subscriptionVerified: true, subscriptionSyncState: 'verified',
  currentPeriodEnd: '2030-01-01T00:00:00Z', canManageSubscription: true, canSubscribe: false };

test('refresh and failure both hide the previous active status and billing date', () => {
  const retry = jest.fn();
  const { rerender } = render(<AccountPage user={current} onRefreshSubscription={retry} />);
  expect(screen.getByText(/Status: Active/)).toBeInTheDocument();
  rerender(<AccountPage user={current} isRefreshingSubscription onRefreshSubscription={retry} />);
  expect(screen.getByRole('status')).toHaveTextContent('Checking subscription');
  expect(screen.queryByText(/Status: Active/)).not.toBeInTheDocument();
  expect(screen.queryByText(/2030/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel Subscription' })).not.toBeInTheDocument();
  rerender(<AccountPage user={current} subscriptionError="Subscription status could not be verified. Please retry." onRefreshSubscription={retry} />);
  expect(screen.getByRole('status')).toHaveTextContent('Subscription status unavailable');
  expect(screen.queryByText(/Status: Active/)).not.toBeInTheDocument();
  expect(screen.queryByText(/2030/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry status check' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test.each(['unavailable', 'unlinked', 'foreign'])('state %s cannot advertise active access or subscription mutations', state => {
  render(<AccountPage user={{ ...current, subscriptionVerified: false, subscriptionSyncState: state,
    canManageSubscription: false, canSubscribe: false, subscriptionMessage: 'Please contact the site owner.' }} />);
  expect(screen.queryByText(/Status: Active/)).not.toBeInTheDocument();
  expect(screen.queryByText(/2030/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel Subscription' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Subscribe Now' })).not.toBeInTheDocument();
  expect(screen.getByText('Please contact the site owner.')).toBeInTheDocument();
});

test.each([true, false])('explicit none state may subscribe when verified is %s', verified => {
  const subscribe = jest.fn();
  render(<AccountPage user={{ ...current, subscriptionStatus: 'inactive', subscriptionVerified: verified,
    subscriptionSyncState: 'none', canManageSubscription: false, canSubscribe: true, currentPeriodEnd: null }} onSubscribe={subscribe} />);
  expect(screen.getByText('Status: Inactive')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe Now' }));
  expect(subscribe).toHaveBeenCalledWith('/account');
});

test('verified legacy status is readable but has no management or duplicate-subscription actions', () => {
  render(<AccountPage user={{ ...current, subscriptionStatus: 'canceled', canManageSubscription: false, canSubscribe: false,
    subscriptionMessage: 'This subscription cannot be managed from this site.' }} />);
  expect(screen.getByText('Status: Canceled')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Cancel Subscription|Reactivate Subscription|Subscribe Now/ })).not.toBeInTheDocument();
});

test('a verified Stripe active status grants access without inventing a future billing date from an old period', () => {
  const user = { ...current, currentPeriodEnd: '2025-01-01T00:00:00Z' };
  render(<AccountPage user={user} />);
  expect(hasSubscriptionAccess(user)).toBe(true);
  expect(screen.getByText(/Status: Active/)).toBeInTheDocument();
  expect(screen.queryByText(/2025/)).not.toBeInTheDocument();
  expect(screen.getByText('The next billing date is not currently available.')).toBeInTheDocument();
});
