import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CameraCapture, canUseInAppCamera } from '../components/CameraCapture';
import { apiErrorMessage, getApiBaseUrl, probeApiReachable } from '../lib/api';
import { preprocessReceiptImage } from '../lib/image';
import {
  enqueueOutbox,
  getOutboxBlob,
  listOutbox,
  removeOutbox,
  type OutboxMeta,
} from '../lib/outbox';
import {
  flushPendingOutbox,
  syncFailureUserMessage,
} from '../lib/outbox-sync';
import { toast } from '../lib/toast';

type QueueItem = { id: string; previewUrl: string; status: string };
type ConnStatus = 'checking' | 'online' | 'device-offline' | 'api-unreachable';

export function CapturePage() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flushing, setFlushing] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [conn, setConn] = useState<ConnStatus>('checking');
  const [cameraOpen, setCameraOpen] = useState(false);
  const navigate = useNavigate();
  const previewUrlsRef = useRef<Map<string, string>>(new Map());
  const mountedRef = useRef(true);

  async function hydrateQueueFromOutbox() {
    try {
      const existing = await listOutbox();
      if (!mountedRef.current) return;
      const items: QueueItem[] = [];
      const keep = new Set<string>();
      for (const m of existing.filter((x) => x.status !== 'done')) {
        keep.add(m.id);
        let previewUrl = previewUrlsRef.current.get(m.id) ?? '';
        if (!previewUrl) {
          const blob = await getOutboxBlob(m.id);
          if (!mountedRef.current) return;
          if (blob) {
            previewUrl = URL.createObjectURL(blob);
            previewUrlsRef.current.set(m.id, previewUrl);
          }
        }
        items.push({ id: m.id, previewUrl, status: labelFor(m) });
      }
      for (const [id, url] of previewUrlsRef.current) {
        if (!keep.has(id)) {
          URL.revokeObjectURL(url);
          previewUrlsRef.current.delete(id);
        }
      }
      setQueue(items);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = apiErrorMessage(err, 'Could not read offline outbox');
      setError(msg);
      toast(msg, 'danger');
    }
  }

  async function refreshConnectivity() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setConn('device-offline');
      return;
    }
    setConn('checking');
    const ok = await probeApiReachable();
    if (!mountedRef.current) return;
    setConn(ok ? 'online' : 'api-unreachable');
  }

  useEffect(() => {
    mountedRef.current = true;
    void refreshConnectivity();
    const onOnline = () => {
      void refreshConnectivity();
    };
    const onOffline = () => setConn('device-offline');
    // After system camera / file picker, mobile Safari may restore from bfcache — rehydrate.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void hydrateQueueFromOutbox();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void hydrateQueueFromOutbox();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    const t = window.setInterval(() => void refreshConnectivity(), 30_000);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(t);
      for (const url of previewUrlsRef.current.values()) URL.revokeObjectURL(url);
      previewUrlsRef.current.clear();
    };
  }, []);

  async function runFlush() {
    setFlushing(true);
    setError(null);
    try {
      const { reviewIds, failures } = await flushPendingOutbox((id, status) => {
        if (!mountedRef.current) return;
        setQueue((q) =>
          q.map((item) => (item.id === id ? { ...item, status } : item)),
        );
        if (status === 'Done') {
          const preview = previewUrlsRef.current.get(id);
          if (preview) {
            URL.revokeObjectURL(preview);
            previewUrlsRef.current.delete(id);
          }
          setQueue((q) => q.filter((item) => item.id !== id));
        }
      });

      if (!mountedRef.current) return;

      // Reconcile after shared single-flight (Shell may own the onItem callbacks).
      await hydrateQueueFromOutbox();
      await refreshConnectivity();

      if (!mountedRef.current) return;

      if (failures.length) {
        const first = failures[0]!;
        const msg = syncFailureUserMessage(first.kind, first.message);
        setError(msg);
        if (first.kind === 'error') toast(msg, 'danger');
        else if (first.kind === 'api-unreachable') toast(msg, 'neutral');
      } else if (reviewIds.length > 0) {
        toast(
          reviewIds.length === 1
            ? 'Receipt uploaded'
            : `Synced ${reviewIds.length} receipts`,
          'ok',
        );
      }

      if (reviewIds.length === 1) {
        navigate(`/receipts/${reviewIds[0]}`);
      } else if (reviewIds.length > 1) {
        navigate('/receipts?status=NEEDS_REVIEW');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = apiErrorMessage(err, 'Outbox sync failed');
      setError(msg);
      toast(msg, 'danger');
    } finally {
      if (mountedRef.current) setFlushing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateQueueFromOutbox();
      if (!cancelled && mountedRef.current && navigator.onLine) {
        await runFlush();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function discard(id: string) {
    if (!confirm('Discard this queued receipt photo?')) return;
    setDiscardingId(id);
    try {
      await removeOutbox(id);
      const preview = previewUrlsRef.current.get(id);
      if (preview) {
        URL.revokeObjectURL(preview);
        previewUrlsRef.current.delete(id);
      }
      setQueue((q) => q.filter((item) => item.id !== id));
      toast('Discarded from outbox', 'ok');
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not discard outbox item'), 'danger');
    } finally {
      setDiscardingId(null);
    }
  }

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setError(null);

    for (const file of files) {
      if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
        toast('Please choose a photo (JPEG, PNG, or HEIC)', 'danger');
        continue;
      }
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.set(id, previewUrl);
      setQueue((q) => [...q, { id, previewUrl, status: 'Processing…' }]);

      try {
        const { blob, hash } = await preprocessReceiptImage(file);
        await enqueueOutbox({ id, hash, blob });
        URL.revokeObjectURL(previewUrl);
        const processedPreview = URL.createObjectURL(blob);
        previewUrlsRef.current.set(id, processedPreview);
        setQueue((q) =>
          q.map((item) =>
            item.id === id
              ? { ...item, previewUrl: processedPreview, status: 'Queued' }
              : item,
          ),
        );
      } catch (err) {
        setQueue((q) =>
          q.map((item) =>
            item.id === id ? { ...item, status: 'Failed' } : item,
          ),
        );
        const msg = apiErrorMessage(err, 'Could not process image');
        setError(msg);
        toast(msg, 'danger');
      }
    }

    if (navigator.onLine) {
      await runFlush();
    } else {
      setError('Offline — receipts saved locally and will upload when you reconnect.');
    }
  }

  function onFileInputChange(input: HTMLInputElement) {
    // Copy FileList before clearing — live lists empty when value is reset.
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    void handleFiles(files);
  }

  function openCamera() {
    if (canUseInAppCamera()) {
      setCameraOpen(true);
      return;
    }
    cameraInputRef.current?.click();
  }

  const canRetry = queue.some(
    (q) =>
      q.status.includes('Queued') ||
      q.status.includes('offline') ||
      q.status.includes('API unreachable') ||
      q.status.includes('Uploading') ||
      q.status.startsWith('Failed'),
  );

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold">Capture</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Photograph a receipt or pick one from your library. Images resize to 1600px and queue
          until upload succeeds.
        </p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]" aria-live="polite">
          {conn === 'checking' && 'Checking connection…'}
          {conn === 'online' && `Online · API ${getApiBaseUrl()}`}
          {conn === 'device-offline' &&
            'Device offline — photos stay queued until you reconnect.'}
          {conn === 'api-unreachable' &&
            `Internet is up, but the API is unreachable (${getApiBaseUrl()}). Confirm VITE_API_URL on the web service and CORS_ORIGIN on the API.`}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-label="Take a receipt photo with the camera"
          onClick={() => openCamera()}
          className="flex min-h-[180px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--brand-soft)] bg-[var(--surface)] text-center backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
        >
          <span className="brand text-3xl text-[var(--brand)]" aria-hidden="true">
            Take photo
          </span>
          <span className="mt-2 max-w-xs px-3 text-sm text-[var(--ink-muted)]">
            Opens an in-app camera (stays on this page)
          </span>
        </button>
        <button
          type="button"
          aria-label="Choose receipt photos from your library"
          onClick={() => libraryInputRef.current?.click()}
          className="flex min-h-[180px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--line)] bg-[var(--surface)] text-center backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
        >
          <span className="text-2xl font-semibold text-[var(--ink)]">Choose photos</span>
          <span className="mt-2 max-w-xs px-3 text-sm text-[var(--ink-muted)]">
            Pick one or more from your gallery
          </span>
        </button>
      </div>

      {/* Fallback only — prefer in-app camera to avoid iOS capture white-screen */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFileInputChange(e.target)}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFileInputChange(e.target)}
      />

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void handleFiles([file])}
        onFallbackToSystemCamera={() => cameraInputRef.current?.click()}
      />

      <p className="text-center text-sm text-[var(--ink-muted)]">
        Camera blocked?{' '}
        <Link to="/capture/manual" className="font-semibold text-[var(--brand-soft)]">
          Enter receipt manually
        </Link>
        {' · '}
        <button
          type="button"
          className="font-semibold text-[var(--brand-soft)]"
          onClick={() => cameraInputRef.current?.click()}
        >
          System camera
        </button>
      </p>

      {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}

      {canRetry && (
        <button
          type="button"
          disabled={flushing || conn === 'device-offline'}
          aria-busy={flushing}
          onClick={() => void runFlush()}
          className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {flushing ? 'Syncing…' : 'Retry outbox sync'}
        </button>
      )}

      {queue.length > 0 && (
        <ul className="space-y-3" aria-label="Capture outbox">
          {queue.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-md bg-black/10" />
              )}
              <span className="min-w-0 flex-1 text-sm font-medium">{item.status}</span>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-[var(--danger)] disabled:opacity-50"
                disabled={discardingId === item.id || flushing}
                aria-busy={discardingId === item.id}
                onClick={() => void discard(item.id)}
              >
                {discardingId === item.id ? 'Discarding…' : 'Discard'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelFor(m: OutboxMeta) {
  if (m.status === 'failed') {
    if (m.error && /Failed to fetch|NetworkError|Load failed/i.test(m.error)) {
      return typeof navigator !== 'undefined' && !navigator.onLine
        ? 'Queued (offline)'
        : 'Queued (API unreachable)';
    }
    if (m.error && !/offline/i.test(m.error)) {
      return `Failed: ${m.error}`;
    }
    return 'Queued (offline)';
  }
  if (m.status === 'uploading') return 'Uploading… (will retry)';
  if (m.status === 'done') return 'Done';
  return 'Queued';
}
