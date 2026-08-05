import { useEffect, useRef, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallbackToSystemCamera: () => void;
};

/**
 * In-page rear camera via getUserMedia.
 * Avoids the common mobile Safari white-screen when returning from `<input capture>`.
 */
export function CameraCapture({
  open,
  onClose,
  onCapture,
  onFallbackToSystemCamera,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [snapping, setSnapping] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('In-app camera is not supported in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (!cancelled) setReady(true);
        }
      } catch (err) {
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access, or use the system camera / photo library.'
            : 'Could not open the camera. Try the system camera or choose a photo instead.';
        if (!cancelled) setError(msg);
      }
    })();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || snapping) return;
    setSnapping(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unsupported');
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          setSnapping(false);
          if (!blob) {
            setError('Could not capture frame. Try again.');
            return;
          }
          const file = new File([blob], `receipt-${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          onCapture(file);
          onClose();
        },
        'image/jpeg',
        0.92,
      );
    } catch (err) {
      setSnapping(false);
      setError(err instanceof Error ? err.message : 'Could not capture frame');
    }
  }

  if (!open) return null;

  return (
    <div
      className="camera-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Take receipt photo"
    >
      <div className="camera-overlay__bar">
        <button type="button" className="camera-overlay__text-btn" onClick={onClose}>
          Cancel
        </button>
        <span className="camera-overlay__title">Receipt camera</span>
        <span className="camera-overlay__spacer" aria-hidden="true" />
      </div>

      <div className="camera-overlay__stage">
        <video
          ref={videoRef}
          className="camera-overlay__video"
          playsInline
          muted
          autoPlay
        />
        {!ready && !error && (
          <p className="camera-overlay__hint">Starting camera…</p>
        )}
        {error && (
          <div className="camera-overlay__error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                onClose();
                onFallbackToSystemCamera();
              }}
            >
              Use system camera
            </button>
          </div>
        )}
      </div>

      <div className="camera-overlay__controls">
        <button
          type="button"
          className="camera-overlay__shutter"
          aria-label="Take photo"
          disabled={!ready || !!error || snapping}
          onClick={() => snap()}
        />
      </div>
    </div>
  );
}

export function canUseInAppCamera(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    (window.isSecureContext || location.hostname === 'localhost')
  );
}
