import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import AccountPage from '../components/AccountPage';
import useUserStatus from './useUserStatus';

const user = { id: 42, email: 'student@example.invalid', subscriptionStatus: 'active',
  subscriptionSource: 'stripe', subscriptionVerified: true, subscriptionSyncState: 'verified',
  canManageSubscription: true, canSubscribe: false, currentPeriodEnd: '2030-01-01T00:00:00Z' };
const success = value => ({ ok: true, status: 200, json: async () => ({ user: value }) });
const options = unauthorized => ({ token: 'synthetic-token', backendUrl: 'https://api.example.test', onUnauthorized: unauthorized });

beforeEach(() => { localStorage.clear(); global.fetch = jest.fn(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('failed refresh preserves login and identity, removes stale active state, and Retry recovers from Stripe', async () => {
  const unauthorized = jest.fn();
  let rejectRefresh;
  fetch.mockResolvedValueOnce(success(user)).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }))
    .mockResolvedValueOnce(success({ ...user, subscriptionStatus: 'canceled', canManageSubscription: false, canSubscribe: true }));
  function Harness() {
    const state = useUserStatus(options(unauthorized));
    return <AccountPage user={state.user} isRefreshingSubscription={state.isRefreshing} subscriptionError={state.error}
      onRefreshSubscription={state.refresh} />;
  }
  render(<Harness />);
  await screen.findByText(/Status: Active/);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh subscription status' }));
  expect(screen.queryByText(/Status: Active/)).not.toBeInTheDocument();
  expect(screen.queryByText(/2030/)).not.toBeInTheDocument();
  await act(async () => { rejectRefresh(new TypeError('Network unavailable')); });
  expect(screen.getByText('student@example.invalid')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Subscription status unavailable');
  expect(unauthorized).not.toHaveBeenCalled();
  const cached = JSON.parse(localStorage.getItem('user'));
  expect(cached.subscriptionVerified).toBe(false);
  expect(cached.currentPeriodEnd).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry status check' }));
  await screen.findByText('Status: Canceled');
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('account entry and foreground events recheck status, without periodic polling or duplicate concurrent calls', async () => {
  const unauthorized = jest.fn();
  fetch.mockResolvedValue(success(user));
  const { result, rerender } = renderHook(({ accountVisible }) => useUserStatus({ ...options(unauthorized), accountVisible }),
    { initialProps: { accountVisible: false } });
  await waitFor(() => expect(result.current.user?.subscriptionVerified).toBe(true));
  expect(fetch).toHaveBeenCalledTimes(1);
  rerender({ accountVisible: true });
  await waitFor(() => expect(result.current.isRefreshing).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  expect(fetch).toHaveBeenCalledTimes(3);
  jest.useFakeTimers();
  await act(async () => { jest.advanceTimersByTime(300_000); });
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('401 ends the session, while 503 and an unavailable Stripe result do not', async () => {
  const unauthorized = jest.fn();
  fetch.mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce(success({ ...user, subscriptionStatus: 'unknown', subscriptionVerified: false,
      subscriptionSyncState: 'unavailable', canManageSubscription: false, currentPeriodEnd: null }))
    .mockResolvedValueOnce({ ok: false, status: 401 });
  const { result } = renderHook(() => useUserStatus(options(unauthorized)));
  await waitFor(() => expect(result.current.error).toMatch(/could not be verified/));
  expect(unauthorized).not.toHaveBeenCalled();
  await act(async () => { await result.current.refresh(); });
  expect(result.current.user.subscriptionVerified).toBe(false);
  expect(unauthorized).not.toHaveBeenCalled();
  await act(async () => { await result.current.refresh(); });
  expect(unauthorized).toHaveBeenCalledTimes(1);
});

test('a request from the previous login cannot overwrite the current account', async () => {
  const unauthorized = jest.fn();
  let resolveOld;
  fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(success({ ...user, id: 99, email: 'new@example.invalid' }));
  const { result, rerender } = renderHook(({ token }) => useUserStatus({ ...options(unauthorized), token }),
    { initialProps: { token: 'first' } });
  const oldSignal = fetch.mock.calls[0][1].signal;
  rerender({ token: 'second' });
  await waitFor(() => expect(result.current.user?.id).toBe(99));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { resolveOld(success(user)); });
  expect(result.current.user.id).toBe(99);
});

test('a stalled cold-start request becomes retryable after ninety seconds without logging out', async () => {
  jest.useFakeTimers();
  const unauthorized = jest.fn();
  fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const { result } = renderHook(() => useUserStatus(options(unauthorized)));
  expect(result.current.isRefreshing).toBe(true);
  await act(async () => { jest.advanceTimersByTime(90_000); });
  expect(result.current.isRefreshing).toBe(false);
  expect(result.current.error).toMatch(/could not be verified/);
  expect(unauthorized).not.toHaveBeenCalled();
});

test('switching login hides the previous account before the new status response arrives', async () => {
  const unauthorized = jest.fn();
  let resolveNext;
  fetch.mockResolvedValueOnce(success(user))
    .mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve; }));
  const { result, rerender } = renderHook(({ token }) => useUserStatus({ ...options(unauthorized), token }),
    { initialProps: { token: 'first' } });
  await waitFor(() => expect(result.current.user?.id).toBe(42));
  rerender({ token: 'second' });
  expect(result.current.user).toBeNull();
  expect(localStorage.getItem('user')).toBeNull();
  await act(async () => { resolveNext(success({ ...user, id: 99 })); });
  expect(result.current.user.id).toBe(99);
});
