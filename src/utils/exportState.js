export const emptyExportJob = () => ({ status: 'idle', jobId: null, downloadUrl: null, error: null });
export const emptyExportState = () => ({ docx: emptyExportJob(), pdf: emptyExportJob() });

export function exportExpiry(value) {
  const expiry = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(expiry) ? expiry : 0;
}

export function restoreExportState(stored, sourceText, ownerId, now = Date.now()) {
  const clean = emptyExportState();
  try {
    const parsed = JSON.parse(stored);
    if (!parsed || parsed.sourceText !== sourceText || parsed.ownerId !== ownerId) return clean;
    for (const format of ['docx', 'pdf']) {
      const job = parsed.jobs?.[format];
      if (job?.status === 'completed' && job.downloadUrl && exportExpiry(job.expiresAt) > now) {
        clean[format] = { ...job, expiresAt: exportExpiry(job.expiresAt) };
      }
    }
  } catch { /* Missing or stale browser state simply starts a new export. */ }
  return clean;
}
