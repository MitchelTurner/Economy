import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOutbox } from '../lib/outbox';
import { flushPendingOutbox } from '../lib/outbox-sync';
import { toast } from '../lib/toast';

/** Shell-level online listener + pending outbox badge. */
export function OutboxSync() {
  const [pending, setPending] = useState(0);

  async function refreshCount() {
    const items = await listOutbox();
    setPending(items.filter((x) => x.status !== 'done').length);
  }

  useEffect(() => {
    void refreshCount();
    const flushQuiet = async (announce: boolean) => {
      const result = await flushPendingOutbox();
      if (announce) {
        if (result.reviewIds.length > 0) {
          toast(
            result.reviewIds.length === 1
              ? 'Queued receipt synced'
              : `Synced ${result.reviewIds.length} queued receipts`,
            'ok',
          );
        }
        const hardFails = result.failures.filter((f) => !f.offlineLikely);
        if (hardFails.length > 0) {
          toast(hardFails[0]!.message || 'Some receipts failed to sync', 'danger');
        }
      }
      await refreshCount();
    };
    const onOnline = () => {
      void flushQuiet(true);
    };
    const onFocus = () => {
      void refreshCount();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    if (navigator.onLine) {
      void flushQuiet(false);
    }
    const t = window.setInterval(() => void refreshCount(), 15_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(t);
    };
  }, []);

  if (pending <= 0) return null;

  return (
    <p className="mb-2 rounded-md border border-[var(--warn)] bg-white/80 px-3 py-2 text-sm text-[var(--warn)]">
      {pending} receipt{pending === 1 ? '' : 's'} waiting to sync.{' '}
      <Link to="/capture" className="font-semibold underline">
        Open Capture
      </Link>
    </p>
  );
}
