import { useEffect } from 'react';
import { flushPendingOutbox } from '../lib/outbox-sync';

/** Shell-level online listener so outbox flushes even when Capture isn't mounted. */
export function OutboxSync() {
  useEffect(() => {
    const onOnline = () => {
      void flushPendingOutbox();
    };
    window.addEventListener('online', onOnline);
    if (navigator.onLine) {
      void flushPendingOutbox();
    }
    return () => window.removeEventListener('online', onOnline);
  }, []);
  return null;
}
