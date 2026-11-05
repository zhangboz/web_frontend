export const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;
export const EXPORT_REQUEST_TIMEOUT_MS = 90 * 1000;
export const EXPORT_POLL_INTERVAL_MS = 5000;
export const emptyExportJob = () => ({ status: 'idle', jobId: null, requestKey: null,
  startedAt: null, downloadUrl: null, error: null, retryable: false });
export const emptyExportState = () => ({ docx: emptyExportJob(), pdf: emptyExportJob() });

export function exportExpiry(value) {
  const expiry = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(expiry) ? expiry : 0;
}

export const isPendingExport = job => ['queuing', 'polling'].includes(job?.status);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const safeMessage = (value, fallback) => hasText(value) ? value.trim() : fallback;
const timeoutMessage = 'This export is taking longer than expected. Retry to check the same job.';

export function restoreExportState(stored, sourceText, ownerId, now = Date.now()) {
  const clean = emptyExportState();
  try {
    const parsed = JSON.parse(stored);
    if (!parsed || parsed.sourceText !== sourceText || parsed.ownerId !== ownerId) return clean;
    for (const format of ['docx', 'pdf']) {
      const job = parsed.jobs?.[format];
      if (job?.status === 'completed' && hasText(job.downloadUrl) && exportExpiry(job.expiresAt) > now) {
        clean[format] = { ...emptyExportJob(), ...job, expiresAt: exportExpiry(job.expiresAt) };
      } else if ((isPendingExport(job) || job?.status === 'failed') && hasText(job.requestKey) &&
        Number.isFinite(job.startedAt) && job.startedAt > 0) {
        clean[format] = { ...emptyExportJob(), ...job, jobId: hasText(job.jobId) ? job.jobId : null };
        if (isPendingExport(job) && (job.startedAt > now || now - job.startedAt >= EXPORT_TIMEOUT_MS)) {
          clean[format] = { ...clean[format], status: 'failed', retryable: true, error: timeoutMessage };
        }
      }
    }
  } catch { /* Missing or stale browser state simply starts a new export. */ }
  return clean;
}

export function persistExportState(storage, jobs, sourceText, ownerId) {
  try {
    storage.setItem('exportState', JSON.stringify({ sourceText, ownerId, jobs }));
  } catch { /* Browser storage may be disabled; the current request still works. */ }
}

/** One request at a time; cancellation and transport retries never start a different model job. */
export function createExportRunner({ backendUrl, token, format, markdownText, job, onUpdate,
  fetchImpl = fetch, now = Date.now,
  pollIntervalMs = EXPORT_POLL_INTERVAL_MS, requestTimeoutMs = EXPORT_REQUEST_TIMEOUT_MS,
  timeoutMs = EXPORT_TIMEOUT_MS, maxFailures = 5,
} = {}) {
  let current = { ...job, status: job.jobId ? 'polling' : 'queuing', error: null };
  let running = false;
  let stopped = false;
  let nextTimer;
  let deadlineTimer;
  let requestTimer;
  let controller;
  let failures = 0;

  const publish = patch => {
    current = { ...current, ...patch };
    if (!stopped) onUpdate(current);
  };
  const clearTimers = () => {
    clearTimeout(nextTimer);
    clearTimeout(deadlineTimer);
    clearTimeout(requestTimer);
  };
  const stop = () => {
    stopped = true;
    running = false;
    clearTimers();
    controller?.abort();
  };
  const fail = (message, retryable = true) => {
    publish({ status: 'failed', error: message, retryable });
    stop();
  };
  const remaining = () => current.startedAt + timeoutMs - now();
  const schedule = () => {
    if (stopped) return;
    if (remaining() <= 0) return fail(timeoutMessage);
    nextTimer = setTimeout(step, Math.min(pollIntervalMs, remaining()));
  };

  async function step() {
    if (stopped) return;
    if (remaining() <= 0) return fail(timeoutMessage);
    const creating = !current.jobId;
    controller = new AbortController();
    let timedOut = false;
    requestTimer = setTimeout(() => { timedOut = true; controller?.abort(); }, Math.min(requestTimeoutMs, remaining()));
    let checkImmediately = false;
    try {
      const response = await fetchImpl(creating ? `${backendUrl}/api/export/${format}`
        : `${backendUrl}/api/export/status/${encodeURIComponent(current.jobId)}`, {
        ...(creating ? { method: 'POST', body: JSON.stringify({ markdownText }) } : {}),
        headers: { Authorization: `Bearer ${token}`,
          ...(creating ? { 'Content-Type': 'application/json', 'Idempotency-Key': current.requestKey } : {}) },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (stopped) return;
      if (!response.ok) {
        const error = new Error(safeMessage(data?.message, 'The export service is temporarily unavailable.'));
        error.transient = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      if (!data || typeof data !== 'object') throw new Error('The export service returned an invalid response.');
      if (creating) {
        if (data.success === false || !hasText(data.jobId)) throw new Error(safeMessage(data.message, 'The server did not return an export job.'));
        publish({ status: 'polling', jobId: data.jobId, error: null });
        checkImmediately = true;
      } else if (data.state === 'completed') {
        const expiresAt = exportExpiry(data.result?.expiresAt);
        if (!hasText(data.result?.downloadUrl) || expiresAt <= now()) {
          return fail('This download has expired. Please export the document again.', false);
        }
        publish({ status: 'completed', downloadUrl: data.result.downloadUrl, expiresAt, error: null, retryable: false });
        stop();
      } else if (data.state === 'expired') {
        fail(safeMessage(data.message, 'This download has expired. Please export the document again.'), false);
      } else if (data.state === 'failed') {
        fail(safeMessage(data.message, 'Conversion failed on the server. Please try exporting again.'), false);
      } else if (!hasText(data.state)) {
        throw new Error('The export service returned an invalid response.');
      }
      failures = 0;
    } catch (error) {
      if (stopped) return;
      if (remaining() <= 0) return fail(timeoutMessage);
      failures += 1;
      if (error.transient === false || failures >= maxFailures) {
        return fail(timedOut ? 'The server did not respond in time. Retry to check the same job.'
          : safeMessage(error.message, 'The export connection was interrupted. Retry to check the same job.'));
      }
    } finally {
      clearTimeout(requestTimer);
      controller = null;
    }
    if (stopped) return;
    // The first GET is immediate; later GETs wait until the preceding request settles.
    if (checkImmediately) void step();
    else schedule();
  }

  return {
    get running() { return running; },
    start() {
      if (running || stopped) return;
      running = true;
      publish({ status: current.jobId ? 'polling' : 'queuing', error: null });
      deadlineTimer = setTimeout(() => fail(timeoutMessage), Math.max(0, remaining()));
      // React StrictMode can dispose an initial effect before it issues any request.
      void Promise.resolve().then(step);
    },
    stop,
  };
}
