import { useEffect, useRef, useState } from 'react';
import { fetchAuthedBlobUrl } from '../lib/api';

export function ReceiptImageViewer({
  imageUrl,
  signedImageUrl,
  alt = 'Receipt',
}: {
  imageUrl?: string | null;
  signedImageUrl?: string | null;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const panRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setZoom(1);

    async function load() {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      if (signedImageUrl) {
        if (!cancelled) setSrc(signedImageUrl);
        return;
      }
      if (!imageUrl) {
        if (!cancelled) setSrc(null);
        return;
      }
      try {
        const url = await fetchAuthedBlobUrl(imageUrl);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setSrc(url);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || 'Could not load image');
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [imageUrl, signedImageUrl]);

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center bg-black/5 text-sm text-[var(--danger)] lg:min-h-[420px]">
        {error}
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex h-64 items-center justify-center bg-[linear-gradient(160deg,#1a6b59,#0c4a3e)] text-white/80 lg:min-h-[420px]">
        <p className="brand text-2xl">No receipt image</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/90">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          className="rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white"
          onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
        >
          −
        </button>
        <span className="text-xs text-white/70 tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white"
          onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
        >
          +
        </button>
        <button
          type="button"
          className="ml-auto rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white"
          onClick={() => setZoom(1)}
        >
          Reset
        </button>
      </div>
      <div
        ref={panRef}
        className="flex h-64 cursor-grab items-start justify-center overflow-auto active:cursor-grabbing lg:h-[min(70vh,640px)]"
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            maxWidth: zoom === 1 ? '100%' : 'none',
            width: zoom === 1 ? '100%' : undefined,
          }}
          className="select-none transition-transform duration-150"
        />
      </div>
    </div>
  );
}
