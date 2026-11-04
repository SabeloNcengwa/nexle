import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import styles from './seller.module.scss';

type Props = {
  disabled?: boolean;
  onEmptyChange?: (empty: boolean) => void;
  padRef: MutableRefObject<SignaturePadHandle | null>;
};

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toPngBlob: () => Promise<Blob>;
};

export function SignaturePad({ disabled, onEmptyChange, padRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const empty = useRef(true);
  const [hasInk, setHasInk] = useState(false);

  const setEmpty = (value: boolean) => {
    empty.current = value;
    setHasInk(!value);
    onEmptyChange?.(value);
  };

  const resize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = parent.clientWidth;
    const height = Math.max(180, Math.min(240, Math.round(width * 0.38)));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#15202b';
    ctx.lineWidth = 2.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setEmpty(true);
  };

  useEffect(() => {
    resize();
    const onResize = () => {
      // Resizing clears the pad — keep layout correct on rotate.
      resize();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    padRef.current = {
      clear: () => resize(),
      isEmpty: () => empty.current,
      toPngBlob: () =>
        new Promise((resolve, reject) => {
          const canvas = canvasRef.current;
          if (!canvas || empty.current) {
            reject(new Error('Draw your signature first'));
            return;
          }
          canvas.toBlob((blob) => {
            if (!blob) reject(new Error('Could not capture signature'));
            else resolve(blob);
          }, 'image/png');
        }),
    };
    return () => {
      padRef.current = null;
    };
  }, [padRef]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (empty.current) setEmpty(false);
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <div className={styles.sigPad}>
      <div className={styles.sigPadFrame}>
        <canvas
          ref={canvasRef}
          className={styles.sigCanvas}
          aria-label="Signature pad"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        />
        {!hasInk && <span className={styles.sigHint}>Sign here</span>}
      </div>
      <div className={styles.sigPadActions}>
        <button
          type="button"
          className={styles.btnGhost}
          disabled={disabled || !hasInk}
          onClick={() => resize()}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
