import { fireEvent, render, screen } from '@testing-library/react';
import AccountPage from './components/AccountPage';
import { hasSubscriptionAccess } from './utils/subscription';
import { exportExpiry, restoreExportState } from './utils/exportState';

test('trial user can cancel and pending cancellation can be restored', () => {
  const cancel = jest.fn();
  const restore = jest.fn();
  const props = { user: { email: 'test@example.invalid', subscriptionStatus: 'trialing',
    currentPeriodEnd: '2030-01-01T00:00:00Z' }, onCancelSubscription: cancel,
    onReactivateSubscription: restore, onSubscribe: jest.fn() };
  const { rerender } = render(<AccountPage {...props} />);
  expect(screen.getByText(/Status: Trial/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Subscription' }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Subscribe Now' })).not.toBeInTheDocument();
  rerender(<AccountPage {...props} user={{ ...props.user, cancelAtPeriodEnd: true }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reactivate Subscription' }));
  expect(restore).toHaveBeenCalledTimes(1);
});

test('only active and trialing subscription states grant premium access', () => {
  expect(hasSubscriptionAccess('active')).toBe(true);
  expect(hasSubscriptionAccess('trialing')).toBe(true);
  for (const state of ['inactive', 'incomplete', 'past_due', 'canceled']) expect(hasSubscriptionAccess(state)).toBe(false);
});

test('export cache preserves server expiry, rejects expired links and other users or documents', () => {
  const expiresAt = '2030-01-01T00:00:00Z';
  const stored = JSON.stringify({ ownerId: 42, sourceText: 'answer', jobs: {
    docx: { status: 'completed', downloadUrl: '/signed-download', expiresAt },
  } });
  expect(restoreExportState(stored, 'answer', 42, 1).docx.expiresAt).toBe(Date.parse(expiresAt));
  expect(restoreExportState(stored, 'answer', 42, Date.parse(expiresAt)).docx.status).toBe('idle');
  expect(restoreExportState(stored, 'different answer', 42, 1).docx.status).toBe('idle');
  expect(restoreExportState(stored, 'answer', 43, 1).docx.status).toBe('idle');
  expect(restoreExportState('{broken', 'answer', 42, 1).pdf.status).toBe('idle');
  expect(exportExpiry('invalid')).toBe(0);
});
