export type ToastTone = 'ok' | 'danger' | 'neutral';

export type ToastMessage = {
  id: number;
  message: string;
  tone: ToastTone;
};

type Listener = (toast: ToastMessage | null) => void;

const listeners = new Set<Listener>();
let seq = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, tone: ToastTone = 'neutral') {
  const next: ToastMessage = { id: ++seq, message, tone };
  listeners.forEach((l) => l(next));
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    listeners.forEach((l) => l(null));
    clearTimer = null;
  }, 3200);
}

export function subscribeToast(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
