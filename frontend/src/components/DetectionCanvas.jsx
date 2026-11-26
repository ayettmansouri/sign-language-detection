import { useEffect, useRef, useState } from 'react';
import { colorFor } from '../utils/colors';

/**
 * Affiche une image avec les boites englobantes, labels et scores superposes.
 *
 * Les coordonnees renvoyees par l'API sont en pixels de l'image ORIGINALE :
 * le canvas a donc la taille naturelle de l'image et le navigateur le met
 * a l'echelle en CSS, sans aucun calcul de conversion.
 */
export default function DetectionCanvas({ imageUrl, detections = [] }) {
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setImage(img);
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const W = image.naturalWidth;
    const H = image.naturalHeight;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, W, H);

    const lineWidth = Math.max(2, W / 160);
    const fontSize = Math.max(14, Math.round(W / 28));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';

    for (const d of detections) {
      const { x1, y1, x2, y2 } = d.bbox;
      const color = colorFor(d.label);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const text = `${d.label} ${Math.round(d.confidence * 100)}%`;
      const pad = fontSize * 0.3;
      const tw = ctx.measureText(text).width + pad * 2;
      const th = fontSize + pad * 2;
      const ty = y1 - th < 0 ? y1 : y1 - th;
      ctx.fillStyle = color;
      ctx.fillRect(x1 - lineWidth / 2, ty, tw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x1 + pad - lineWidth / 2, ty + pad);
    }
  }, [image, detections]);

  if (!imageUrl) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-400">
        Aucune image
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="h-auto w-full rounded-xl bg-slate-100"
      data-testid="detection-canvas"
    />
  );
}
