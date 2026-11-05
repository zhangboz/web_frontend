import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResultsPage from './ResultsPage';

jest.mock('react-markdown', () => ({ children }) => <div>{children}</div>);
jest.mock('remark-gfm', () => jest.fn());
jest.mock('remark-math', () => jest.fn());
jest.mock('rehype-katex', () => jest.fn());
jest.mock('react-syntax-highlighter', () => ({ Prism: ({ children }) => <pre>{children}</pre> }));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ okaidia: {} }));

const props = () => ({ response: { reply1: 'Answer: x = 2', reply2: 'Subtract three and divide by two.' },
  backendUrl: 'http://localhost:5000', user: { id: 42, subscriptionStatus: 'trialing', subscriptionSource: 'stripe',
    subscriptionVerified: true, subscriptionSyncState: 'verified' }, token: 'test-token',
  onRequestLogin: jest.fn(), onSubscribe: jest.fn(), audioCache: new Map(), setAudioCache: jest.fn() });

beforeEach(() => { sessionStorage.clear(); global.fetch = jest.fn(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('partial result keeps the answer and explains why voice is unavailable', () => {
  render(<ResultsPage {...props()} response={{ reply1: 'Answer: x = 2', reply2: null, warning: 'Explanation is temporarily unavailable.' }} />);
  expect(screen.getByText('Answer: x = 2')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Explanation is temporarily unavailable.');
  expect(screen.queryByRole('button', { name: /Explain in Voice/ })).not.toBeInTheDocument();
});

test('trial user can request AI-labeled voice without subscribing again', async () => {
  const values = props();
  global.fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['audio'], { type: 'audio/wav' }) });
  render(<ResultsPage {...values} />);
  expect(screen.getByText(/AI-generated voice/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Explain in Voice/ }));
  await waitFor(() => expect(values.setAudioCache).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:5000/api/speech', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
  }));
  expect(values.onSubscribe).not.toHaveBeenCalled();
});

test('an unverified old active status cannot dispatch exports, voice or a duplicate checkout', () => {
  const values = props();
  const retry = jest.fn();
  render(<ResultsPage {...values} onRefreshSubscription={retry}
    user={{ ...values.user, subscriptionStatus: 'active', subscriptionVerified: false, subscriptionSyncState: 'unavailable' }} />);
  const voice = screen.getByRole('button', { name: /Explain in Voice/ });
  const pdf = screen.getByRole('button', { name: /Export to PDF/ });
  expect(voice).toBeDisabled();
  expect(pdf).toBeDisabled();
  fireEvent.click(voice);
  fireEvent.click(pdf);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(values.onSubscribe).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Retry status check/ }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Answer: x = 2')).toBeInTheDocument();
});

test('verified legacy canceled subscriptions explain unavailable actions without offering another checkout', () => {
  const values = props();
  render(<ResultsPage {...values} user={{ ...values.user, subscriptionStatus: 'canceled', canSubscribe: false,
    subscriptionMessage: 'This subscription cannot be managed from this site.' }} />);
  expect(screen.getByText('This subscription cannot be managed from this site.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Export to Word/ })).toBeDisabled();
  expect(values.onSubscribe).not.toHaveBeenCalled();
});

test('completed export expires at the server deadline and offers regeneration', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  const expiresAt = new Date(Date.now() + 6000).toISOString();
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, jobId: '1' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'completed', result: { downloadUrl: '/signed.docx', expiresAt } }) });
  const { unmount } = render(<ResultsPage {...props()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Export to Word/ })); });
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByRole('link', { name: /Download Word/ })).toHaveAttribute('href', '/signed.docx');
  await act(async () => { jest.advanceTimersByTime(3001); });
  expect(screen.queryByRole('link', { name: /Download Word/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Export to Word/ })).toBeInTheDocument();
  unmount();
  jest.clearAllTimers();
});


test('failed PDF export shows the server explanation, preserves the answer and permits retry', async () => {
  jest.useFakeTimers();
  const message = 'PDF conversion could not render the mathematical formatting. Please check the equations and try again.';
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, jobId: 'failed-pdf' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'failed', message }) });
  const { unmount } = render(<ResultsPage {...props()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Export to PDF/ })); });
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.getByText('Answer: x = 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Export to PDF/ })).toBeEnabled();
  expect(screen.queryByRole('link', { name: /Download PDF/ })).not.toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  unmount();
  jest.clearAllTimers();
});

test.each([undefined, null, '', '   ', { detail: 'invalid response' }, 503])(
  'failed export falls back to a useful message when the server message is %p', async message => {
    jest.useFakeTimers();
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, jobId: 'failed-word' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'failed', message }) });
    const { unmount } = render(<ResultsPage {...props()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Export to Word/ })); });
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(screen.getByText('Conversion failed on the server. Please try exporting again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export to Word/ })).toBeEnabled();
    unmount();
    jest.clearAllTimers();
  }
);
