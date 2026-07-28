import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOutbox } from '../lib/outbox';
import { flushPendingOutbox } from '../lib/outbox-sync';

/** Shell-level online listener + pending outbox badge. */
export function OutboxSync() {
  const [pending, setPending] = useState(0);

  async function refreshCount() {
    const items = await listOutbox();
    setPending(items.filter((x) => x.status !== 'done').length);
  }

  useEffect(() => {
    void refreshCount();
    const onOnline = () => {
      void flushPendingOutbox().finally(() => void refreshCount());
    };
    const onFocus = () => {
      void refreshCount();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    if (navigator.onLine) {
      void flushPendingOutbox().finally(() => void refreshCount());
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
