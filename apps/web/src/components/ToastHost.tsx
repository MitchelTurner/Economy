import { useEffect, useState } from 'react';
import { subscribeToast, type ToastMessage } from '../lib/toast';

export function ToastHost() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => subscribeToast(setToast), []);

  if (!toast) return null;

  const toneClass =
    toast.tone === 'ok'
      ? 'border-[var(--ok)] text-[var(--ok)]'
      : toast.tone === 'danger'
        ? 'border-[var(--danger)] text-[var(--danger)]'
        : 'border-[var(--line)] text-[var(--ink)]';

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed bottom-20 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-md border bg-white/95 px-4 py-3 text-sm font-semibold shadow-md backdrop-blur md:bottom-6',
        toneClass,
      ].join(' ')}
    >
      {toast.message}
    </div>
  );
}
