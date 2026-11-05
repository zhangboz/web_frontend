import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ResultsPage from './ResultsPage';

jest.mock('react-markdown', () => ({ children }) => <div>{children}</div>);
jest.mock('remark-gfm', () => jest.fn());
jest.mock('remark-math', () => jest.fn());
jest.mock('rehype-katex', () => jest.fn());
jest.mock('react-syntax-highlighter', () => ({ Prism: ({ children }) => <pre>{children}</pre> }));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ okaidia: {} }));

const props = { response: { reply1: 'Synthetic answer', reply2: null }, backendUrl: 'https://api.example.test',
  user: { id: 42, subscriptionStatus: 'trialing', subscriptionSource: 'stripe', subscriptionVerified: true,
    subscriptionSyncState: 'verified' }, token: 'synthetic-token', onRequestLogin: jest.fn(),
  onSubscribe: jest.fn(), audioCache: new Map(), setAudioCache: jest.fn() };
const success = data => ({ ok: true, status: 200, json: async () => data });
const storeJob = job => sessionStorage.setItem('exportState', JSON.stringify({ ownerId: 42, sourceText: props.response.reply1, jobs: { pdf: job } }));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => { sessionStorage.clear(); jest.useFakeTimers(); global.fetch = jest.fn(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

test('refresh resumes a known job once and unmount aborts its status request', async () => {
  storeJob({ status: 'polling', jobId: 'existing-job', requestKey: 'same-key', startedAt: Date.now() });
  let signal;
  fetch.mockImplementation((_url, request) => { signal = request.signal; return new Promise(() => {}); });
  const { rerender, unmount } = render(<ResultsPage {...props} />);
  await act(flush);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/export/status/existing-job');
  rerender(<ResultsPage {...props} user={{ ...props.user }} />);
  await act(flush);
  expect(fetch).toHaveBeenCalledTimes(1);
  const saved = JSON.parse(sessionStorage.getItem('exportState')).jobs.pdf;
  expect(saved).toEqual(expect.objectContaining({ jobId: 'existing-job', requestKey: 'same-key' }));
  unmount();
  expect(signal.aborted).toBe(true);
});

test('refresh after a lost create response reuses the creation key', async () => {
  storeJob({ status: 'queuing', jobId: null, requestKey: 'original-key', startedAt: Date.now() });
  fetch.mockResolvedValueOnce(success({ success: true, jobId: 'recovered-job' }))
    .mockResolvedValueOnce(success({ state: 'completed', result: { downloadUrl: '/signed.pdf', expiresAt: Date.now() + 900_000 } }));
  const { unmount } = render(<ResultsPage {...props} />);
  await act(flush);
  expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('original-key');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('link', { name: /Download PDF/ })).toBeInTheDocument();
  unmount();
});

test('creation key is persisted before the first network request and survives manual transport retry', async () => {
  let firstKey;
  fetch.mockImplementation(async (_url, request) => {
    const saved = JSON.parse(sessionStorage.getItem('exportState')).jobs.pdf;
    firstKey ||= request.headers['Idempotency-Key'];
    expect(saved.requestKey).toBe(firstKey);
    return { ok: false, status: 503, json: async () => ({}) };
  });
  const { unmount } = render(<ResultsPage {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Export to PDF/ })); await flush(); });
  for (let i = 0; i < 4; i++) await act(async () => { jest.advanceTimersByTime(5000); await flush(); });
  expect(fetch).toHaveBeenCalledTimes(5);
  expect(screen.getByRole('button', { name: /Export to PDF/ })).toBeEnabled();
  fetch.mockResolvedValueOnce(success({ success: true, jobId: 'recovered' }))
    .mockResolvedValueOnce(success({ state: 'failed', message: 'Synthetic provider failure.' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Export to PDF/ })); await flush(); });
  expect(fetch.mock.calls[5][1].headers['Idempotency-Key']).toBe(firstKey);
  expect(screen.getByText('Synthetic answer')).toBeInTheDocument();
  unmount();
});


test('StrictMode refresh still sends only one resume request', async () => {
  storeJob({ status: 'polling', jobId: 'strict-job', requestKey: 'strict-key', startedAt: Date.now() });
  fetch.mockResolvedValue(success({ state: 'active' }));
  const { unmount } = render(<StrictMode><ResultsPage {...props} /></StrictMode>);
  await act(flush);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/export/status/strict-job');
  unmount();
});
