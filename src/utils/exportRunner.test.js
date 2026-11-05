import { createExportRunner, restoreExportState, emptyExportJob,
  EXPORT_TIMEOUT_MS, EXPORT_REQUEST_TIMEOUT_MS } from './exportState';

const now = 1_800_000_000_000;
const key = 'synthetic-idempotency-key';
const success = data => ({ ok: true, status: 200, json: async () => data });
const complete = () => success({ state: 'completed', result: {
  downloadUrl: 'https://api.example.test/download/signed.pdf', expiresAt: new Date(Date.now() + 900_000).toISOString(),
} });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const advance = async time => { jest.advanceTimersByTime(time); await flush(); };
const options = (extra = {}) => ({ backendUrl: 'https://api.example.test', token: 'synthetic-token',
  format: 'pdf', markdownText: '## Synthetic answer', job: { ...emptyExportJob(), startedAt: now, requestKey: key },
  onUpdate: jest.fn(), ...extra });

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('pending cache restoration is scoped to owner/source and retains creation keys', () => {
  const jobs = { pdf: { status: 'polling', jobId: 'job-1', startedAt: now, requestKey: key },
    docx: { status: 'queuing', jobId: null, startedAt: now, requestKey: 'key-word' } };
  const stored = JSON.stringify({ ownerId: 42, sourceText: 'answer', jobs });
  expect(restoreExportState(stored, 'answer', 42, now).pdf).toEqual(expect.objectContaining(jobs.pdf));
  expect(restoreExportState(stored, 'answer', 42, now).docx).toEqual(expect.objectContaining(jobs.docx));
  expect(restoreExportState(stored, 'answer', 43, now).pdf.status).toBe('idle');
  expect(restoreExportState(stored, 'different', 42, now).pdf.status).toBe('idle');
  const expired = restoreExportState(stored, 'answer', 42, now + EXPORT_TIMEOUT_MS).pdf;
  expect(expired.status).toBe('failed');
  expect(expired.retryable).toBe(true);
  expect(expired.requestKey).toBe(key);
});

test('transport retries keep the POST idempotency key and never issue overlapping status calls', async () => {
  let resolveStatus;
  const pendingStatus = new Promise(resolve => { resolveStatus = resolve; });
  const fetchImpl = jest.fn()
    .mockRejectedValueOnce(new TypeError('Network unavailable'))
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
    .mockResolvedValueOnce(success({ success: true, jobId: 'job-one' }))
    .mockReturnValueOnce(pendingStatus)
    .mockResolvedValueOnce(complete());
  const onUpdate = jest.fn();
  const runner = createExportRunner(options({ fetchImpl, onUpdate }));
  runner.start(); await flush();
  await advance(5000); await advance(5000);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  for (const [, request] of fetchImpl.mock.calls.slice(0, 3)) expect(request.headers['Idempotency-Key']).toBe(key);
  await advance(20_000);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  resolveStatus(success({ state: 'active' })); await flush();
  await advance(4999); expect(fetchImpl).toHaveBeenCalledTimes(4);
  await advance(1); expect(fetchImpl).toHaveBeenCalledTimes(5);
  expect(onUpdate.mock.calls.at(-1)[0].status).toBe('completed');
  expect(runner.running).toBe(false);
});

test('a Render cold start can take seventy seconds without losing the export', async () => {
  const fetchImpl = jest.fn()
    .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(success({ success: true, jobId: 'cold-job' })), 70_000)))
    .mockResolvedValueOnce(complete());
  const onUpdate = jest.fn();
  const runner = createExportRunner(options({ fetchImpl, onUpdate }));
  runner.start(); await flush();
  await advance(69_999); expect(fetchImpl).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(onUpdate.mock.calls.at(-1)[0].status).toBe('completed');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('five consecutive transport failures stop; a manual retry can retain the same job', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  const onUpdate = jest.fn();
  const runner = createExportRunner(options({ fetchImpl, onUpdate }));
  runner.start(); await flush();
  for (let i = 0; i < 4; i++) await advance(5000);
  expect(fetchImpl).toHaveBeenCalledTimes(5);
  const failed = onUpdate.mock.calls.at(-1)[0];
  expect(failed).toEqual(expect.objectContaining({ status: 'failed', requestKey: key, retryable: true }));
  await advance(100_000); expect(fetchImpl).toHaveBeenCalledTimes(5);
  const retryFetch = jest.fn().mockResolvedValueOnce(success({ success: true, jobId: 'existing-job' })).mockResolvedValueOnce(complete());
  const retry = createExportRunner(options({ job: { ...failed, startedAt: Date.now() }, fetchImpl: retryFetch }));
  retry.start(); await flush();
  expect(retryFetch.mock.calls[0][1].headers['Idempotency-Key']).toBe(key);
});

test('request timeout aborts transport and unmount cancellation prevents further updates', async () => {
  const signals = [];
  const fetchImpl = jest.fn((_url, { signal }) => { signals.push(signal); return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }); });
  const onUpdate = jest.fn();
  const runner = createExportRunner(options({ fetchImpl, onUpdate }));
  runner.start(); await flush();
  await advance(EXPORT_REQUEST_TIMEOUT_MS);
  expect(signals[0].aborted).toBe(true);
  await advance(5000); expect(signals.length).toBe(2);
  const updates = onUpdate.mock.calls.length;
  runner.stop(); await flush();
  expect(signals[1].aborted).toBe(true);
  await advance(EXPORT_TIMEOUT_MS);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(onUpdate).toHaveBeenCalledTimes(updates);
});

test('overall ten-minute deadline stops active polling without creating a new job', async () => {
  const onUpdate = jest.fn();
  const fetchImpl = jest.fn().mockResolvedValue(success({ state: 'active' }));
  const runner = createExportRunner(options({ job: { status: 'polling', jobId: 'known-job', requestKey: key, startedAt: now }, fetchImpl, onUpdate }));
  runner.start(); await flush();
  await advance(EXPORT_TIMEOUT_MS);
  expect(onUpdate.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({ status: 'failed', retryable: true, jobId: 'known-job' }));
  expect(fetchImpl.mock.calls.every(([url]) => url.endsWith('/status/known-job'))).toBe(true);
});
